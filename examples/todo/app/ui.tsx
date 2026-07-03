// app/ui.tsx — a few shared, inline-style building blocks.
//
// This demo keeps styling inline (no CSS pipeline) so each route reads as a
// single self-contained file. The design tokens live as CSS variables in
// `root.tsx`; these helpers just reference them.

import { toast } from "@bractjs/bractjs";
import { type CSSProperties, useEffect, useRef } from "react";

export interface ActionResult {
  ok?: string;
  error?: string;
}

// Flash a toast whenever a `<Form>` action settles with `{ ok }` / `{ error }`.
// Keyed on the actionData identity so it fires once per submission, not on
// every re-render or revalidation.
export function useActionToast(actionData: ActionResult | null | undefined) {
  const last = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (!actionData || actionData === last.current) return;
    last.current = actionData;
    if (actionData.error) toast.error(actionData.error);
    else if (actionData.ok) toast.success(actionData.ok);
  }, [actionData]);
}

export const card: CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  boxShadow: "0 12px 40px rgba(5, 35, 40, 0.08)",
  padding: "1.4rem",
};

export const input: CSSProperties = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: "10px",
  padding: ".68rem .75rem",
  fontSize: "1rem",
  width: "100%",
};

export const primaryButton: CSSProperties = {
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  borderRadius: "10px",
  padding: ".68rem .95rem",
  fontWeight: 700,
  cursor: "pointer",
};

export const ghostButton: CSSProperties = {
  border: "1px solid var(--line)",
  background: "#fff",
  borderRadius: "8px",
  padding: ".42rem .62rem",
  cursor: "pointer",
};

export const dangerButton: CSSProperties = {
  border: "1px solid #f4c1c1",
  background: "#fff5f5",
  color: "var(--danger)",
  borderRadius: "8px",
  padding: ".42rem .62rem",
  cursor: "pointer",
};

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        margin: 0,
        color: "var(--danger)",
        background: "#ffeceb",
        border: "1px solid #f8c5c5",
        borderRadius: "10px",
        padding: ".58rem .65rem",
      }}
    >
      {children}
    </p>
  );
}

export function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div
      style={{
        borderRadius: "999px",
        border: "1px solid var(--line)",
        padding: ".4rem .7rem",
        display: "inline-flex",
        alignItems: "center",
        gap: ".42rem",
        background: "#fff",
      }}
    >
      <span style={{ color: "var(--muted)", fontSize: ".86rem" }}>{label}</span>
      <span
        style={{
          minWidth: "1.8rem",
          height: "1.5rem",
          padding: "0 .45rem",
          borderRadius: "999px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          color: "#fff",
          background: tone,
          fontSize: ".88rem",
        }}
      >
        {value}
      </span>
    </div>
  );
}
