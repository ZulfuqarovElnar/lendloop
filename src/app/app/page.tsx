"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useCurrentUser } from "@/components/ConvexClientProvider";
import { LoanList } from "@/components/LoanList";
import { ToolForm } from "@/components/ToolForm";
import { Button, Card, CATEGORIES, Empty, Pill, TrustedBadge, errorText, timeAgo, todayISO, type Category } from "@/components/ui";

const TABS = ["Browse", "My listings", "My requests", "Incoming requests", "Admin"] as const;
type Tab = (typeof TABS)[number];

export default function AppPage() {
  const { isLoading, isAuthenticated } = useCurrentUser();
  if (isLoading) return <p className="p-8 text-center text-sm text-muted">Loading…</p>;
  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="mb-4">Your session has ended.</p>
        <SignInButton mode="modal">
          <button className="rounded-xl bg-moss px-5 py-3 font-medium text-moss-ink">Sign in again</button>
        </SignInButton>
      </main>
    );
  }
  return <Board />;
}

function Board() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("Browse");
  const tabs = TABS.filter((t) => t !== "Admin" || me?.role === "admin");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">LendLoop</Link>
        <div className="flex items-center gap-3">
          {me?.trusted && <TrustedBadge />}
          {me?.role === "admin" && <Pill tone="warn">admin</Pill>}
          <UserButton />
        </div>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab === t ? "border-moss font-semibold" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Browse" && <Browse />}
      {tab === "My listings" && <MyListings />}
      {tab === "My requests" && <MyRequests />}
      {tab === "Incoming requests" && <Incoming />}
      {tab === "Admin" && me?.role === "admin" && <Admin />}
    </main>
  );
}

function MyRequests() {
  return <LoanList loans={useQuery(api.loans.myRequests)} view="borrower" empty="You haven't asked to borrow anything yet." />;
}

function Incoming() {
  return <LoanList loans={useQuery(api.loans.incoming)} view="owner" empty="No one has asked for your tools yet." />;
}

type BoardTool = FunctionReturnType<typeof api.tools.list>[number];
const AVAILABILITY_TONE = { available: "good", "on loan": "warn", overdue: "bad" } as const;

function Browse() {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.list, category ? { category } : {});

  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {(["", ...CATEGORIES] as const).map((c) => (
          <button
            key={c || "all"}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={`rounded-full border px-3 py-1 text-sm ${category === c ? "border-ink bg-ink text-paper" : "border-line hover:bg-card"}`}
          >
            {c || "All"}
          </button>
        ))}
      </div>
      {tools === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : tools.length === 0 ? (
        <Empty>No tools in this category yet.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((t) => <ToolCard key={t._id} tool={t} />)}
        </div>
      )}
    </section>
  );
}

function ToolCard({ tool }: { tool: BoardTool }) {
  const [asking, setAsking] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{tool.name}</h3>
          <p className="text-sm text-muted">
            {tool.category} · {tool.condition} · {tool.mine ? "yours" : <>lent by {tool.ownerName}</>}
          </p>
        </div>
        <Pill tone={AVAILABILITY_TONE[tool.availability]}>{tool.availability}</Pill>
      </div>
      {tool.description && <p className="mt-2 text-sm">{tool.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tool.ownerTrusted && !tool.mine && <TrustedBadge />}
        {!tool.mine && !asking && <Button onClick={() => setAsking(true)}>Request to borrow</Button>}
      </div>
      {asking && <BorrowForm toolId={tool._id} onDone={() => setAsking(false)} />}
    </Card>
  );
}

function BorrowForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const [startDate, setStart] = useState(todayISO());
  const [endDate, setEnd] = useState(todayISO());
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) return <p className="mt-3 text-sm text-moss">Request sent. The owner will be notified.</p>;
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await request({ toolId, startDate, endDate });
          setSent(true);
          setTimeout(onDone, 2500);
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <label className="grid gap-1 text-xs text-muted">
        From
        <input type="date" required min={todayISO()} value={startDate} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs text-muted">
        Until
        <input type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <Button tone="primary">Send request</Button>
      <Button type="button" onClick={onDone}>Cancel</Button>
      {error && <p className="w-full text-sm text-rust">{error}</p>}
    </form>
  );
}

function MyListings() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [error, setError] = useState("");

  return (
    <section className="grid gap-6">
      <Card>
        <h2 className="mb-3 font-display text-lg font-semibold">List a tool</h2>
        <ToolForm submitLabel="Add to the shelf" onSubmit={(f) => create(f)} />
      </Card>
      {error && <p className="text-sm text-rust">{error}</p>}
      {tools === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : tools.length === 0 ? (
        <Empty>You haven&apos;t listed anything yet.</Empty>
      ) : (
        <div className="grid gap-2">
          {tools.map((t) =>
            editing === t._id ? (
              <Card key={t._id}>
                <ToolForm
                  initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                  submitLabel="Save"
                  onSubmit={async (f) => {
                    await update({ toolId: t._id, ...f });
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </Card>
            ) : (
              <Card key={t._id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{t.name}</span>{" "}
                  <span className="text-sm text-muted">· {t.category} · {t.condition}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={AVAILABILITY_TONE[t.availability]}>{t.availability}</Pill>
                  <Button onClick={() => setEditing(t._id)}>Edit</Button>
                  <Button
                    tone="danger"
                    onClick={async () => {
                      if (!confirm(`Remove “${t.name}” from LendLoop?`)) return;
                      setError("");
                      try {
                        await remove({ toolId: t._id });
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function Admin() {
  const users = useQuery(api.users.adminList);
  const tools = useQuery(api.tools.adminList);
  const loans = useQuery(api.loans.adminAll);
  const errors = useQuery(api.automation.recentErrors);
  const setTrusted = useMutation(api.users.setTrusted);
  const remove = useMutation(api.tools.remove);
  const [error, setError] = useState("");

  return (
    <section className="grid gap-8">
      {error && <p className="text-sm text-rust">{error}</p>}
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">Automation errors</h2>
        {errors?.length ? (
          <div className="grid gap-2">
            {errors.map((e) => (
              <Card key={e._id} className="text-sm">
                <span className="font-medium">{e.workflow}</span>
                {e.node && <span className="text-muted"> · {e.node}</span>}
                <span className="text-muted"> · {timeAgo(e._creationTime)}</span>
                <p className="mt-1 text-rust">{e.message}</p>
              </Card>
            ))}
          </div>
        ) : (
          <Empty>No failed workflow runs reported.</Empty>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">People</h2>
        <div className="grid gap-2">
          {users?.map((u) => (
            <Card key={u._id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">{u.name}</span> <span className="text-sm text-muted">{u.email}</span>{" "}
                {u.role === "admin" && <Pill tone="warn">admin</Pill>}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={u.trusted} onChange={(e) => setTrusted({ userId: u._id, trusted: e.target.checked })} />
                Trusted lender
              </label>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">All listings</h2>
        <div className="grid gap-2">
          {tools?.map((t) => (
            <Card key={t._id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">{t.name}</span> <span className="text-sm text-muted">· {t.category} · {t.ownerName}</span>
              </div>
              <Button
                tone="danger"
                onClick={async () => {
                  if (!confirm(`Remove “${t.name}” (listed by ${t.ownerName})?`)) return;
                  setError("");
                  try {
                    await remove({ toolId: t._id });
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Remove
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">All loans</h2>
        <LoanList loans={loans} view="admin" empty="No loans yet." />
      </div>
    </section>
  );
}
