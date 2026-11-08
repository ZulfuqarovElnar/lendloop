"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { Empty, Pill } from "@/components/ui";

export default function Home() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20">
      <header className="flex items-center justify-between py-6">
        <span className="font-display text-xl font-semibold tracking-tight">LendLoop</span>
        <Authenticated>
          <Link href="/app" className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-card">
            Open the board →
          </Link>
        </Authenticated>
      </header>

      <section className="py-14 sm:py-20">
        <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight sm:text-7xl">
          Borrow what you need.
          <br />
          <span className="text-moss">Lend what you don’t.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          The drill you use twice a year, the tent in the attic, the pasta machine. LendLoop lets neighbours share them,
          with requests, approvals and return reminders handled for you.
        </p>
        <div className="mt-8">
          <Unauthenticated>
            <SignInButton mode="modal">
              <button className="rounded-xl bg-moss px-5 py-3 font-medium text-moss-ink hover:opacity-90">
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Unauthenticated>
          <Authenticated>
            <Link href="/app" className="inline-block rounded-xl bg-moss px-5 py-3 font-medium text-moss-ink hover:opacity-90">
              Go to the board
            </Link>
          </Authenticated>
          <AuthLoading>
            <span className="text-sm text-muted">Loading…</span>
          </AuthLoading>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold">On the shelf</h2>
          {tools && <span className="text-sm text-muted">{tools.length} tools</span>}
        </div>
        {tools === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : tools.length === 0 ? (
          <Empty>Nothing listed yet. Be the first to lend something.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tools.map((t) => (
              <li key={t._id} className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3">
                <span className="font-medium">{t.name}</span>
                <Pill>{t.category}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
