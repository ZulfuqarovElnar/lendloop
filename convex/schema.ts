import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const CATEGORIES = ["power tools", "hand tools", "garden", "kitchen", "camping", "cleaning", "other"] as const;
export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export const LOAN_STATUSES = ["pending", "approved", "declined", "cancelled", "returned"] as const;

export const category = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const condition = v.union(...CONDITIONS.map((c) => v.literal(c)));
export const loanStatus = v.union(...LOAN_STATUSES.map((s) => v.literal(s)));

export default defineSchema({
  // One row per Clerk user, created on first sign-in. Role and trust live here, not in the
  // client, so every Convex function can check them.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("user")),
    trusted: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  // A borrow request; it becomes a loan once approved. Dates are ISO days (YYYY-MM-DD, UTC).
  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_end", ["status", "endDate"]),

  // What the automations did, shown on each loan. idempotencyKey is unique by construction
  // (checked before insert), so a retried webhook or workflow run never writes twice.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  // Failed n8n executions reported by the error workflow, visible to admins.
  automationErrors: defineTable({
    executionId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
  }).index("by_execution", ["executionId"]),
});
