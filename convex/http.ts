// Endpoints n8n calls. Every request must carry a valid HMAC signature (see lib/hmac.ts);
// anything else gets 401 without detail.
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, type ActionCtx } from "./_generated/server";
import { requireEnv, verify } from "./lib/hmac";

const MAX_BODY = 10_000;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** Reads and authenticates the request; returns the parsed body, or a Response to send back. */
async function authenticate(req: Request): Promise<{ body: Record<string, unknown> } | Response> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);
  const path = new URL(req.url).pathname;
  const ok = await verify(
    requireEnv("LENDLOOP_INBOUND_SECRET"),
    `${req.headers.get("x-lendloop-timestamp")}.${req.method} ${path}.${raw}`,
    req.headers.get("x-lendloop-timestamp"),
    req.headers.get("x-lendloop-signature"),
  );
  if (!ok) return json({ error: "unauthorized" }, 401);
  try {
    return { body: raw ? JSON.parse(raw) : {} };
  } catch {
    return json({ error: "bad json" }, 400);
  }
}

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;
    return json({ loans: await ctx.runQuery(internal.automation.overdueLoans, {}) });
  }),
});

http.route({
  path: "/n8n/reminders",
  method: "POST",
  handler: httpAction(async (ctx: ActionCtx, req) => {
    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;
    const { loanId, idempotencyKey, outcome, detail } = auth.body;
    const key = str(idempotencyKey);
    if (!str(loanId, 64) || !key?.startsWith("remind:") || (outcome !== "sent" && outcome !== "failed")) {
      return json({ error: "invalid body" }, 400);
    }
    try {
      const result = await ctx.runMutation(internal.automation.recordEvent, {
        loanId: loanId as Id<"loans">,
        kind: "overdue_reminder",
        outcome,
        idempotencyKey: key,
        detail: str(detail, 300) ?? undefined,
      });
      return json(result, result.ok ? 200 : 404);
    } catch {
      return json({ error: "invalid loanId" }, 400); // not an id of the loans table
    }
  }),
});

http.route({
  path: "/n8n/errors",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;
    const { executionId, workflow, node, message } = auth.body;
    if (!str(executionId, 100) || !str(workflow, 200) || !str(message, 2000)) return json({ error: "invalid body" }, 400);
    return json(
      await ctx.runMutation(internal.automation.recordError, {
        executionId: executionId as string,
        workflow: workflow as string,
        node: str(node) ?? undefined,
        message: message as string,
      }),
    );
  }),
});

export default http;
