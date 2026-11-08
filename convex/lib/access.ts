// Every authorisation rule lives here and runs inside Convex functions. The UI hides buttons
// a user cannot use, but these checks are what actually enforce the rules.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError("Sign in first.");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Admins only.");
  return user;
}

export async function requireTool(ctx: Ctx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  if (!tool) throw new ConvexError("This tool is no longer listed.");
  return tool;
}

/** The owner may change their tool; an admin may only remove it. */
export async function requireOwnTool(ctx: Ctx, toolId: Id<"tools">, user: Doc<"users">) {
  const tool = await requireTool(ctx, toolId);
  if (tool.ownerId !== user._id) throw new ConvexError("You can only change your own listings.");
  return tool;
}

export async function requireLoan(ctx: Ctx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("Request not found.");
  return loan;
}
