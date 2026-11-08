import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireOwnTool, requireUser } from "./lib/access";
import { today } from "./lib/dates";
import { category, condition } from "./schema";

const LIMITS = { name: 60, description: 400 };

function clean(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new ConvexError("Give the tool a name.");
  if (name.length > LIMITS.name) throw new ConvexError(`Name is limited to ${LIMITS.name} characters.`);
  if (description.length > LIMITS.description) throw new ConvexError(`Description is limited to ${LIMITS.description} characters.`);
  return { name, description };
}

type Availability = "available" | "on loan" | "overdue";

async function availability(ctx: QueryCtx, tool: Doc<"tools">): Promise<Availability> {
  const day = today();
  const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", tool._id)).collect();
  const out = loans.find((l) => l.status === "approved" && l.startDate <= day);
  if (!out) return "available";
  return out.endDate < day ? "overdue" : "on loan";
}

/** For signed-out visitors: name and category only, nothing about the owner. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").take(100);
    return tools.map((t) => ({ _id: t._id, name: t.name, category: t.category }));
  },
});

export const list = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tools = args.category
      ? await ctx.db.query("tools").withIndex("by_category", (q) => q.eq("category", args.category!)).collect()
      : await ctx.db.query("tools").order("desc").collect();
    return Promise.all(
      tools.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          availability: await availability(ctx, t),
          mine: t.ownerId === user._id,
          // First name and trust badge only: enough to decide, no contact details.
          ownerName: owner?.name.split(" ")[0] ?? "Neighbour",
          ownerTrusted: owner?.trusted ?? false,
        };
      }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    return Promise.all(tools.map(async (t) => ({ ...t, availability: await availability(ctx, t) })));
  },
});

const fields = { name: v.string(), category, condition, description: v.string() };

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", { ...args, ...clean(args), ownerId: user._id });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...fields },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await requireUser(ctx);
    await requireOwnTool(ctx, toolId, user);
    await ctx.db.patch(toolId, { ...args, ...clean(args) });
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = user.role === "admin" ? await ctx.db.get(toolId) : await requireOwnTool(ctx, toolId, user);
    if (!tool) return;
    const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
    if (loans.some((l) => l.status === "approved")) {
      throw new ConvexError("This tool is out on loan. Mark it returned before removing it.");
    }
    // Open requests for a removed tool are closed rather than left dangling.
    for (const l of loans) if (l.status === "pending") await ctx.db.patch(l._id, { status: "cancelled", decidedAt: Date.now() });
    await ctx.db.delete(toolId);
  },
});

/** Admin view: every listing with its owner. */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools = await ctx.db.query("tools").order("desc").collect();
    return Promise.all(tools.map(async (t) => ({ ...t, ownerName: (await ctx.db.get(t.ownerId))?.name ?? "?" })));
  },
});
