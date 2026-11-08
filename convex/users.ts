import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUser, requireAdmin } from "./lib/access";

/** Called by the client after sign-in: creates or refreshes the user's row from the Clerk token. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const name = identity.name ?? identity.givenName ?? identity.email?.split("@")[0] ?? "Neighbour";
    const existing = await currentUser(ctx);
    if (existing) {
      if (existing.name !== name || existing.email !== identity.email) {
        await ctx.db.patch(existing._id, { name, email: identity.email });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email: identity.email,
      role: "user",
      trusted: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return user && { _id: user._id, name: user.name, role: user.role, trusted: user.trusted };
  },
});

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, trusted: u.trusted }));
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { trusted });
  },
});

/**
 * Promotes or demotes a user. Internal on purpose: there is no way to become admin from the app;
 * run it from the CLI:  npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (!user) throw new Error(`No user with email ${email}; sign in once first.`);
    await ctx.db.patch(user._id, { role });
    return `${email} is now ${role}`;
  },
});
