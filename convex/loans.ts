import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireLoan, requireTool, requireUser } from "./lib/access";
import { checkRange, overlaps } from "./lib/dates";

/** Hands the change to the notification action; it runs after this mutation commits. */
async function notify(ctx: MutationCtx, loanId: Id<"loans">) {
  await ctx.scheduler.runAfter(0, internal.automation.notifyLoanChange, { loanId, attempt: 1 });
}

async function withDetails(ctx: QueryCtx, loans: Doc<"loans">[]) {
  return Promise.all(
    loans.map(async (l) => {
      const [tool, owner, borrower, events] = await Promise.all([
        ctx.db.get(l.toolId),
        ctx.db.get(l.ownerId),
        ctx.db.get(l.borrowerId),
        ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", l._id)).collect(),
      ]);
      return {
        ...l,
        toolName: tool?.name ?? "(removed tool)",
        ownerName: owner?.name.split(" ")[0] ?? "?",
        ownerTrusted: owner?.trusted ?? false,
        borrowerName: borrower?.name.split(" ")[0] ?? "?",
        activity: events
          .sort((a, b) => b._creationTime - a._creationTime)
          .slice(0, 3)
          .map((e) => ({ kind: e.kind, outcome: e.outcome, at: e._creationTime })),
      };
    }),
  );
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    const tool = await requireTool(ctx, toolId);
    if (tool.ownerId === user._id) throw new ConvexError("You can't borrow your own tool.");
    checkRange(startDate, endDate);

    const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
    if (loans.some((l) => l.status === "approved" && overlaps(l, { startDate, endDate }))) {
      throw new ConvexError("The tool is already lent out for some of those days.");
    }
    if (loans.some((l) => l.status === "pending" && l.borrowerId === user._id)) {
      throw new ConvexError("You already have an open request for this tool.");
    }
    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
    });
    await notify(ctx, loanId);
    return loanId;
  },
});

/** Owner approves or declines a pending request on their own tool. */
export const decide = mutation({
  args: { loanId: v.id("loans"), approve: v.boolean() },
  handler: async (ctx, { loanId, approve }) => {
    const user = await requireUser(ctx);
    const loan = await requireLoan(ctx, loanId);
    if (loan.ownerId !== user._id) throw new ConvexError("Only the tool's owner can decide on this request.");
    if (loan.status !== "pending") throw new ConvexError(`This request is already ${loan.status}.`);
    if (approve) {
      const others = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", loan.toolId)).collect();
      if (others.some((l) => l._id !== loan._id && l.status === "approved" && overlaps(l, loan))) {
        throw new ConvexError("Those dates clash with a loan you already approved.");
      }
    }
    await ctx.db.patch(loanId, { status: approve ? "approved" : "declined", decidedAt: Date.now() });
    await notify(ctx, loanId);
  },
});

/** Borrower withdraws their own pending request. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await requireLoan(ctx, loanId);
    if (loan.borrowerId !== user._id) throw new ConvexError("You can only cancel your own requests.");
    if (loan.status !== "pending") throw new ConvexError(`This request is already ${loan.status}.`);
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await notify(ctx, loanId);
  },
});

/** The owner confirms the tool came back. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await requireLoan(ctx, loanId);
    if (loan.ownerId !== user._id) throw new ConvexError("Only the owner can mark the tool as returned.");
    if (loan.status !== "approved") throw new ConvexError("Only an approved loan can be returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await notify(ctx, loanId);
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).order("desc").collect();
    return withDetails(ctx, loans);
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).order("desc").collect();
    return withDetails(ctx, loans);
  },
});

export const adminAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return withDetails(ctx, await ctx.db.query("loans").order("desc").take(200));
  },
});
