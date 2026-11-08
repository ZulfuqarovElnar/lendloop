// HMAC-SHA256 signing shared by both directions of the n8n integration.
//
//   Convex → n8n:  X-LendLoop-Signature = sha256=hex(HMAC(N8N_WEBHOOK_SECRET, `${ts}.${body}`))
//   n8n → Convex:  X-LendLoop-Signature = sha256=hex(HMAC(LENDLOOP_INBOUND_SECRET, `${ts}.${METHOD} ${path}.${body}`))
//
// X-LendLoop-Timestamp is unix seconds; requests older than five minutes are rejected, so a
// captured request can't be replayed later. Method and path are signed on the inbound side so a
// signature for one endpoint can't be reused on another.
const encoder = new TextEncoder();
export const MAX_SKEW_SECONDS = 300;

async function key(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function sign(secret: string, message: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(message));
  return "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares in time independent of where the strings differ. */
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verify(
  secret: string,
  message: string,
  timestamp: string | null,
  signature: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  return equal(await sign(secret, message), signature);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Convex environment variable ${name}`);
  return value;
}
