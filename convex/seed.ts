// Demo data for local development:  npx convex run seed:demo
// Internal, so it can't be called from the app.
import { internalMutation } from "./_generated/server";
import { today } from "./lib/dates";

const day = (offset: number) => today(Date.now() + offset * 864e5);

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("tools").first()) return "already seeded";
    const ana = await ctx.db.insert("users", { tokenIdentifier: "seed|ana", name: "Ana Lopez", email: "ana@example.com", role: "user", trusted: true });
    const ben = await ctx.db.insert("users", { tokenIdentifier: "seed|ben", name: "Ben Okafor", email: "ben@example.com", role: "user", trusted: false });
    const drill = await ctx.db.insert("tools", { ownerId: ana, name: "Cordless drill", category: "power tools", condition: "good", description: "18V, two batteries, bit set included." });
    await ctx.db.insert("tools", { ownerId: ana, name: "Four-person tent", category: "camping", condition: "fair", description: "Easy to pitch; one pole is taped." });
    const mower = await ctx.db.insert("tools", { ownerId: ben, name: "Push lawn mower", category: "garden", condition: "worn", description: "Works fine, blade sharpened in spring." });
    await ctx.db.insert("tools", { ownerId: ben, name: "Pasta machine", category: "kitchen", condition: "new", description: "Used twice." });
    // One overdue loan for the reminder workflow, one pending request.
    await ctx.db.insert("loans", { toolId: drill, ownerId: ana, borrowerId: ben, startDate: day(-6), endDate: day(-2), status: "approved", decidedAt: Date.now() });
    await ctx.db.insert("loans", { toolId: mower, ownerId: ben, borrowerId: ana, startDate: day(1), endDate: day(3), status: "pending" });
    return "seeded";
  },
});

/** Another overdue loan, for running the reminder workflow again:  npx convex run seed:overdue */
export const overdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tool = await ctx.db.query("tools").first();
    const borrower = await ctx.db.query("users").filter((q) => q.neq(q.field("_id"), tool?.ownerId)).first();
    if (!tool || !borrower) return "run seed:demo first";
    return await ctx.db.insert("loans", {
      toolId: tool._id, ownerId: tool.ownerId, borrowerId: borrower._id,
      startDate: day(-5), endDate: day(-1), status: "approved", decidedAt: Date.now(),
    });
  },
});
