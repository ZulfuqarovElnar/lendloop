// The Convex side of the n8n integration: outgoing signed webhooks with retries, and the
// idempotent write-backs that n8n calls through convex/http.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { today } from "./lib/dates";
import { requireEnv, sign } from "./lib/hmac";

const MAX_ATTEMPTS = 5;
const kind = v.union(v.literal("request_notification"), v.literal("overdue_reminder"));
const outcome = v.union(v.literal("sent"), v.literal("failed"));

// Who hears about each status change.
const RECIPIENT = {
  pending: "owner",
  cancelled: "owner",
  approved: "borrower",
  declined: "borrower",
  returned: "borrower",
} as const;

export const notificationKey = (loanId: Id<"loans">, status: string) => `notify:${loanId}:${status}`;
export const reminderKey = (loanId: Id<"loans">, day: string) => `remind:${loanId}:${day}`;

/**
 * Only the fields the notification needs: who to tell (first name + email), which tool, the
 * dates and the new status. No phone numbers, no other user's email, no descriptions.
 */
export const notificationPayload = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const recipientRole = RECIPIENT[loan.status];
    const recipient = await ctx.db.get(recipientRole === "owner" ? loan.ownerId : loan.borrowerId);
    const tool = await ctx.db.get(loan.toolId);
    if (!recipient?.email) return null;
    return {
      event: `loan.${loan.status}`,
      idempotencyKey: notificationKey(loanId, loan.status),
      loanId,
      recipient: { firstName: recipient.name.split(" ")[0], email: recipient.email, role: recipientRole },
      tool: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

export const hasEvent = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, { idempotencyKey }) => {
    const e = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
    return e?.outcome === "sent";
  },
});

/**
 * Records what an automation did. Safe to call any number of times with the same key: the first
 * call inserts, later calls change nothing (except upgrading an earlier "failed" to "sent").
 */
export const recordEvent = internalMutation({
  args: { loanId: v.id("loans"), kind, outcome, idempotencyKey: v.string(), detail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.loanId))) return { ok: false, reason: "unknown loan" };
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) {
      if (existing.outcome === "failed" && args.outcome === "sent") await ctx.db.patch(existing._id, { outcome: "sent", detail: args.detail });
      return { ok: true, duplicate: true };
    }
    await ctx.db.insert("automationEvents", args);
    return { ok: true, duplicate: false };
  },
});

/** Sends one status change to n8n. Retries with backoff; a final failure is recorded, never dropped. */
export const notifyLoanChange = internalAction({
  args: { loanId: v.id("loans"), attempt: v.number() },
  handler: async (ctx, { loanId, attempt }) => {
    const payload = await ctx.runQuery(internal.automation.notificationPayload, { loanId });
    if (!payload) return;
    if (await ctx.runQuery(internal.automation.hasEvent, { idempotencyKey: payload.idempotencyKey })) return;

    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    let error = "";
    try {
      const res = await fetch(requireEnv("N8N_WEBHOOK_URL"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lendloop-timestamp": ts,
          "x-lendloop-signature": await sign(requireEnv("N8N_WEBHOOK_SECRET"), `${ts}.${body}`),
          "x-idempotency-key": payload.idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        await ctx.runMutation(internal.automation.recordEvent, {
          loanId, kind: "request_notification", outcome: "sent", idempotencyKey: payload.idempotencyKey, detail: payload.event,
        });
        return;
      }
      error = `n8n answered ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (attempt < MAX_ATTEMPTS) {
      const delayMs = 2 ** attempt * 15_000; // 30 s, 1 min, 2 min, 4 min
      await ctx.scheduler.runAfter(delayMs, internal.automation.notifyLoanChange, { loanId, attempt: attempt + 1 });
      console.warn(`notify ${payload.idempotencyKey} attempt ${attempt} failed (${error}); retrying in ${delayMs / 1000}s`);
    } else {
      await ctx.runMutation(internal.automation.recordEvent, {
        loanId, kind: "request_notification", outcome: "failed", idempotencyKey: payload.idempotencyKey,
        detail: `${payload.event}: ${error}`.slice(0, 300),
      });
      console.error(`notify ${payload.idempotencyKey} gave up after ${attempt} attempts: ${error}`);
    }
  },
});

/** Approved loans past their end date that have not had today's reminder yet. */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const day = today();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", day))
      .collect();
    const out = [];
    for (const loan of loans) {
      const key = reminderKey(loan._id, day);
      const done = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("idempotencyKey", key)).unique();
      if (done?.outcome === "sent") continue;
      const [borrower, tool] = await Promise.all([ctx.db.get(loan.borrowerId), ctx.db.get(loan.toolId)]);
      if (!borrower?.email) continue;
      out.push({
        loanId: loan._id,
        idempotencyKey: key,
        borrower: { firstName: borrower.name.split(" ")[0], email: borrower.email },
        tool: tool?.name ?? "a tool",
        dueDate: loan.endDate,
      });
    }
    return out;
  },
});

export const recordError = internalMutation({
  args: { executionId: v.string(), workflow: v.string(), node: v.optional(v.string()), message: v.string() },
  handler: async (ctx, args) => {
    const seen = await ctx.db.query("automationErrors").withIndex("by_execution", (q) => q.eq("executionId", args.executionId)).unique();
    if (seen) return { ok: true, duplicate: true };
    await ctx.db.insert("automationErrors", { ...args, message: args.message.slice(0, 500) });
    return { ok: true, duplicate: false };
  },
});

export const recentErrors = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("automationErrors").order("desc").take(20);
  },
});
