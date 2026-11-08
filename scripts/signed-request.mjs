// Calls a LendLoop n8n endpoint the way n8n does, for testing by hand:
//   LENDLOOP_INBOUND_SECRET=… node scripts/signed-request.mjs <site-url> /n8n/overdue-loans '{}'
import { createHmac } from "node:crypto";

const [base, path, body = "{}"] = process.argv.slice(2);
const secret = process.env.LENDLOOP_INBOUND_SECRET;
if (!base || !path || !secret) {
  console.error("usage: LENDLOOP_INBOUND_SECRET=… node scripts/signed-request.mjs <site-url> <path> [json]");
  process.exit(1);
}
const ts = Math.floor(Date.now() / 1000).toString();
const signature = "sha256=" + createHmac("sha256", secret).update(`${ts}.POST ${path}.${body}`).digest("hex");
const res = await fetch(base + path, {
  method: "POST",
  headers: { "content-type": "application/json", "x-lendloop-timestamp": ts, "x-lendloop-signature": signature },
  body,
});
console.log(res.status, await res.text());
