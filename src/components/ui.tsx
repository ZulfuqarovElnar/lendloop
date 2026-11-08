"use client";

import { ConvexError } from "convex/values";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const CATEGORIES = ["power tools", "hand tools", "garden", "kitchen", "camping", "cleaning", "other"] as const;
export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];

export function Button({ tone = "plain", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "plain" | "danger" }) {
  const tones = {
    primary: "bg-moss text-moss-ink border-moss hover:opacity-90",
    plain: "bg-transparent border-line hover:bg-card",
    danger: "bg-transparent border-line text-rust hover:border-rust",
  };
  return (
    <button
      {...props}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "good" | "warn" | "bad" }) {
  const tones = {
    plain: "border-line text-muted",
    good: "border-moss/40 text-moss",
    warn: "border-sun/60 text-ink bg-sun/20",
    bad: "border-rust/50 text-rust",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export const TrustedBadge = () => <Pill tone="good">✓ Trusted lender</Pill>;

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-card p-4 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</p>;
}

/** The message a Convex function threw on purpose, or a generic one. */
export function errorText(e: unknown) {
  if (e instanceof ConvexError) return String(e.data);
  return "Something went wrong. Try again.";
}

export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export const formatDay = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export const todayISO = () => new Date().toISOString().slice(0, 10);
