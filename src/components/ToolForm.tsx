"use client";

import { useState } from "react";
import { Button, CATEGORIES, CONDITIONS, errorText, type Category, type Condition } from "./ui";

export type ToolFields = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolFields = { name: "", category: "power tools", condition: "good", description: "" };

export function ToolForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolFields;
  submitLabel: string;
  onSubmit: (fields: ToolFields) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolFields>(k: K, v: ToolFields[K]) => setFields((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSubmit(fields);
          if (initial === EMPTY) setFields(EMPTY);
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="grid gap-1 text-sm sm:col-span-2">
        Name
        <input required maxLength={60} value={fields.name} onChange={(e) => set("name", e.target.value)} placeholder="Cordless drill" />
      </label>
      <label className="grid gap-1 text-sm">
        Category
        <select value={fields.category} onChange={(e) => set("category", e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Condition
        <select value={fields.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
          {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Short description
        <textarea
          rows={2}
          maxLength={400}
          value={fields.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="18V, two batteries, comes with a bit set."
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button tone="primary" disabled={busy}>{submitLabel}</Button>
        {onCancel && <Button type="button" onClick={onCancel}>Cancel</Button>}
        {error && <span className="text-sm text-rust">{error}</span>}
      </div>
    </form>
  );
}
