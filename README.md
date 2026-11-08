# LendLoop

*Borrow what you need. Lend what you don't.*

A neighbourhood tool-lending board. Neighbours list tools, request to borrow them for a date range, and owners approve, decline and mark loans returned. n8n sends the notifications and the daily overdue reminders.

**Stack:** Next.js 16 (App Router) · Clerk · Convex · n8n · TypeScript · Tailwind CSS 4

---

## Local setup

You need Node 24, a free [Clerk](https://clerk.com) application, and either Docker or `npx n8n`. Convex can run as a cloud dev deployment (free) or fully locally.

### 1. App and Convex

```sh
npm install
npx convex dev          # first run: log in and create a project; keeps running and pushes functions
```

`npx convex dev` writes `NEXT_PUBLIC_CONVEX_URL` to `.env.local`. Add the Clerk keys next to it (see `.env.example`):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
CLERK_SECRET_KEY=sk_test_…
```

In the Clerk dashboard, open **Integrations → Convex** and activate it. Copy the Frontend API URL into Convex:

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
```

Generate two independent secrets, one for each direction of the integration:

```sh
npx convex env set N8N_WEBHOOK_SECRET      "$(openssl rand -hex 32)"   # Convex → n8n
npx convex env set LENDLOOP_INBOUND_SECRET "$(openssl rand -hex 32)"   # n8n → Convex
npx convex env set N8N_WEBHOOK_URL http://localhost:5678/webhook/lendloop-loan-events
```

Then run the app:

```sh
npm run dev             # http://localhost:3000
```

Sign in once, then make yourself admin. Roles can't be changed from the app, only from the CLI:

```sh
npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
npx convex run seed:demo          # optional: two neighbours, four tools, one overdue loan
```

### 2. n8n

```sh
cd n8n
cp .env.example .env    # same two secrets as above, plus your Convex site URL (https://<deployment>.convex.site)
docker compose up -d
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```

Without Docker, the same environment works with `npx n8n` (also set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and `NODE_FUNCTION_ALLOW_BUILTIN=crypto`), then `npx n8n import:workflow --separate --input=n8n/workflows`.

Open http://localhost:5678 and activate **Loan event notification** and **Overdue reminders**. The error handler doesn't need activating: n8n runs it when either of the other two fails.

To check that everything is wired up, ask to borrow a tool. The notification appears in the n8n execution log (`[LendLoop mock email] …`), and the loan card shows "Notification sent just now". For reminders, run **Overdue reminders** by hand once with the seeded overdue loan.

To call the Convex endpoints the way n8n does:

```sh
LENDLOOP_INBOUND_SECRET=… node scripts/signed-request.mjs https://<deployment>.convex.site /n8n/overdue-loans '{}'
```

---

## Environment variables

| Where | Name | Purpose |
|---|---|---|
| `.env.local` | `NEXT_PUBLIC_CONVEX_URL` | Convex client URL (written by `npx convex dev`) |
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk |
| Convex | `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL. Convex only accepts tokens from this issuer |
| Convex | `N8N_WEBHOOK_URL` | n8n webhook for loan events |
| Convex | `N8N_WEBHOOK_SECRET` | Signs Convex → n8n webhooks |
| Convex | `LENDLOOP_INBOUND_SECRET` | Verifies n8n → Convex calls |
| n8n `.env` | `LENDLOOP_N8N_WEBHOOK_SECRET` | = Convex `N8N_WEBHOOK_SECRET` |
| n8n `.env` | `LENDLOOP_INBOUND_SECRET` | = Convex `LENDLOOP_INBOUND_SECRET` |
| n8n `.env` | `LENDLOOP_CONVEX_SITE_URL` | Convex HTTP actions URL (`…convex.site`) |
| n8n `.env` | `N8N_ENCRYPTION_KEY` | Encrypts n8n's stored credentials |

None of these values appear in the code or in the exported workflow JSON. The workflows read them from the environment at run time.

---

## Architecture

```
 Browser (Next.js + Clerk)
     │  Clerk JWT on every call
     ▼
 Convex ── queries / mutations: all reads and writes, every rule checked here
     │
     ├─ mutation commits ──► scheduler ──► notifyLoanChange (action)
     │                                        │ POST, HMAC-signed, retried with backoff
     │                                        ▼
     │                                   n8n: Loan event notification ──► (mock) email
     │
     └─ HTTP actions (/n8n/*) ◄── HMAC-signed calls from n8n
            ├─ POST /n8n/overdue-loans   ◄── Overdue reminders (daily 09:00 UTC)
            ├─ POST /n8n/reminders       ◄── write-back, idempotent
            └─ POST /n8n/errors          ◄── Error handler workflow
```

| Path | What's there |
|---|---|
| `convex/schema.ts` | `users`, `tools`, `loans`, `automationEvents`, `automationErrors` |
| `convex/lib/access.ts` | `requireUser`, `requireAdmin`, `requireOwnTool`: every authorisation rule |
| `convex/tools.ts`, `convex/loans.ts` | The app's queries and mutations |
| `convex/automation.ts` | Outgoing webhook with retries, idempotent write-backs, overdue query |
| `convex/http.ts` | Endpoints for n8n, signature-checked |
| `convex/lib/hmac.ts` | Signing and verification (Web Crypto, constant-time compare) |
| `src/app/page.tsx` | Public page |
| `src/app/app/page.tsx` | Signed-in app: Browse · My listings · My requests · Incoming requests · Admin |
| `n8n/workflows/*.json` | The three exported workflows |

**Loan lifecycle:** `pending` → `approved` | `declined` | `cancelled`, then `approved` → `returned`. A loan is overdue when it's still `approved` after its end date.

---

## Security and data-minimisation decisions

**Authorisation is enforced in Convex, not the UI.** Every query and mutation starts by checking the caller with `requireUser` or `requireAdmin`. Ownership is checked against the row in the database, never against an ID the client sends:
- Only the owner can edit a tool. The owner or an admin can delete it.
- Only the tool's owner can approve, decline or mark a loan returned.
- Only the borrower can cancel their own request.

The Next.js proxy (`src/proxy.ts`) only redirects signed-out users away from `/app`; it isn't relied on for security.

**Roles can't be self-assigned.** New users are `user`. `users:setRole` is an internal mutation, so it can only be run by someone with deploy access to Convex. "Trusted lender" is a flag only admins can set.

**The public page shows tool name and category only.** Signed-in users see the lender's first name and trust badge. Nobody sees another user's email in the app.

**n8n receives only what the message needs.**
- A notification carries the recipient's first name and email, the tool name, the dates and the status. It doesn't include the other party's identity or contact details, or the tool's description.
- The overdue endpoint returns the same minimal shape.

**Both directions are signed with HMAC-SHA256**, each with its own secret.
- Convex → n8n signs `timestamp.body`. n8n → Convex signs `timestamp.METHOD path.body`, so a signature for one endpoint can't be reused on another.
- Requests older than five minutes are rejected (replay protection).
- Comparison is constant-time.
- The Convex endpoints answer an unsigned or badly signed request with a bare `401`, and reject bodies over 10 KB.

**Write-backs are idempotent.**
- Every automation event has a deterministic key: `notify:<loan>:<status>` and `remind:<loan>:<day>`. `recordEvent` inserts only if the key is new, so n8n retries can't create duplicates.
- A loan with today's reminder recorded drops out of the overdue list, so re-running the workflow doesn't remind twice.
- The notification workflow also remembers the keys it has delivered, in case Convex retries after a timeout that did reach n8n.

**Failures are visible.**
- Convex tries each webhook up to five times with exponential backoff (30 s, 1, 2, 4 min). After that it records a `failed` event, shown on the loan card.
- n8n nodes retry three times. Every workflow points to the error handler, which reports to `/n8n/errors`, and admins see those reports in the Admin tab.
- A failed reminder is written back as `failed` instead of disappearing.

**Input is validated server-side:** string lengths, category and condition enums, ISO dates, no past start dates, at most 30 days, no overlap with an approved loan, and no borrowing your own tool.

---

## What I'd change for production

- **Real email** through a provider (Postmark, SES) behind an n8n credential, with the template and unsubscribe link on the n8n side.
- **Secret rotation:** accept two secrets during a rotation window. Move secrets to a secret manager instead of plain environment variables.
- **Delivery tracking:** replace the in-workflow dedupe store with a delivery log (or a queue) that keeps history and survives n8n restarts.
- **Rate limiting** on mutations, such as borrow requests per user per day, and on the HTTP endpoints.
- **Audit log** of admin actions: removals and trust changes.
- **Data retention:** delete or anonymise loans older than N months, and cascade a user's data when they delete their Clerk account (Clerk webhook → Convex).
- **Time zones:** dates are UTC days today; production needs the user's zone for "overdue" and for the reminder time.
- **Tests:** Convex function tests (`convex-test`) for every access rule, and an end-to-end test of the request → approve → return flow.
- **Hosting:** n8n behind TLS with basic auth or SSO, on a private network path to Convex where possible. Monitoring and alerts on the error workflow.
