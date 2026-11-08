"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Button, Card, Empty, Pill, TrustedBadge, errorText, formatDay, timeAgo, todayISO } from "./ui";

type Loan = FunctionReturnType<typeof api.loans.incoming>[number];
type View = "borrower" | "owner" | "admin";

const STATUS_TONE = { pending: "warn", approved: "good", declined: "bad", cancelled: "plain", returned: "plain" } as const;

function Activity({ items }: { items: Loan["activity"] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-muted">
      {items.map((a, i) => (
        <li key={i} className={a.outcome === "failed" ? "text-rust" : ""}>
          {a.kind === "overdue_reminder" ? "Reminder" : "Notification"} {a.outcome === "sent" ? "sent" : "failed"} {timeAgo(a.at)}
        </li>
      ))}
    </ul>
  );
}

function LoanCard({ loan, view }: { loan: Loan; view: View }) {
  const decide = useMutation(api.loans.decide);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const [error, setError] = useState("");
  const run = (fn: () => Promise<unknown>) => async () => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const overdue = loan.status === "approved" && loan.endDate < todayISO();

  return (
    <Card className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{loan.toolName}</span>
          <Pill tone={overdue ? "bad" : STATUS_TONE[loan.status]}>{overdue ? "overdue" : loan.status}</Pill>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatDay(loan.startDate)} – {formatDay(loan.endDate)} ·{" "}
          {view === "borrower" ? (
            <>from {loan.ownerName} {loan.ownerTrusted && <TrustedBadge />}</>
          ) : view === "owner" ? (
            <>requested by {loan.borrowerName}</>
          ) : (
            <>{loan.borrowerName} borrows from {loan.ownerName}</>
          )}
        </p>
        <Activity items={loan.activity} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view === "owner" && loan.status === "pending" && (
          <>
            <Button tone="primary" onClick={run(() => decide({ loanId: loan._id, approve: true }))}>Approve</Button>
            <Button onClick={run(() => decide({ loanId: loan._id, approve: false }))}>Decline</Button>
          </>
        )}
        {view === "owner" && loan.status === "approved" && (
          <Button onClick={run(() => markReturned({ loanId: loan._id }))}>Mark returned</Button>
        )}
        {view === "borrower" && loan.status === "pending" && (
          <Button onClick={run(() => cancel({ loanId: loan._id }))}>Cancel request</Button>
        )}
      </div>
      {error && <p className="w-full text-sm text-rust">{error}</p>}
    </Card>
  );
}

export function LoanList({ loans, view, empty }: { loans: Loan[] | undefined; view: View; empty: string }) {
  if (loans === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (!loans.length) return <Empty>{empty}</Empty>;
  return (
    <div className="grid gap-2">
      {loans.map((l) => <LoanCard key={l._id} loan={l} view={view} />)}
    </div>
  );
}
