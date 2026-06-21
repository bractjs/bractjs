import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useToasts } from "../hooks/useToast.ts";
import { toast } from "../toast-store.ts";
import type { ToastEntry, ToastType } from "../toast-store.ts";

export type ToastPosition =
  | "top-left" | "top-center" | "top-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface ToasterProps {
  position?: ToastPosition;
  /** Gap between stacked toasts, px. */
  gap?: number;
  /** Custom renderer — receives the entry and a dismiss callback. Falls back to the default card. */
  renderToast?: (toast: ToastEntry, dismiss: () => void) => ReactNode;
}

const ACCENT: Record<ToastType, string> = {
  success: "#16a34a", error: "#dc2626", warning: "#d97706", info: "#2563eb", loading: "#6b7280",
};
const ICON: Record<ToastType, string> = {
  success: "✓", error: "✕", warning: "!", info: "i", loading: "↻",
};

function isTop(p: ToastPosition) { return p.startsWith("top"); }

function containerStyle(position: ToastPosition, gap: number): CSSProperties {
  const [, x] = position.split("-");
  return {
    position: "fixed", zIndex: 9999, display: "flex", flexDirection: "column", gap,
    pointerEvents: "none", maxWidth: "calc(100vw - 32px)", width: 380,
    top: isTop(position) ? 16 : undefined, bottom: isTop(position) ? undefined : 16,
    left: x === "left" ? 16 : x === "center" ? "50%" : undefined,
    right: x === "right" ? 16 : undefined,
    transform: x === "center" ? "translateX(-50%)" : undefined,
  };
}

function ToastCard({ entry, top }: { entry: ToastEntry; top: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  const dismiss = () => toast.dismiss(entry.id);
  return (
    <div
      role={entry.type === "error" ? "alert" : "status"}
      aria-live={entry.type === "error" ? "assertive" : "polite"}
      data-bract-toast={entry.type}
      style={{
        pointerEvents: "auto", display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 14px", borderRadius: 10, background: "#fff", color: "#111",
        border: "1px solid rgba(0,0,0,0.08)", borderLeft: `4px solid ${ACCENT[entry.type]}`,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)", fontSize: 14, lineHeight: 1.4,
        transition: "opacity .22s ease, transform .22s ease",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${top ? -8 : 8}px)`,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "0 0 auto", width: 20, height: 20, borderRadius: "50%", color: "#fff",
          background: ACCENT[entry.type], display: "grid", placeItems: "center",
          fontSize: 12, fontWeight: 700, marginTop: 1,
        }}
      >
        {ICON[entry.type]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{entry.message}</div>
        {entry.description ? (
          <div style={{ marginTop: 2, color: "#555", fontWeight: 400 }}>{entry.description}</div>
        ) : null}
        {entry.action ? (
          <button
            type="button"
            onClick={() => { entry.action!.onClick(); dismiss(); }}
            style={{
              marginTop: 8, padding: "4px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              color: ACCENT[entry.type], background: "transparent",
              border: `1px solid ${ACCENT[entry.type]}`, borderRadius: 6,
            }}
          >
            {entry.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button" aria-label="Dismiss" onClick={dismiss}
        style={{
          flex: "0 0 auto", border: "none", background: "transparent", cursor: "pointer",
          color: "#888", fontSize: 16, lineHeight: 1, padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Renders the active toast queue. Mount once in root.tsx, then call `toast.*`
 * (or `useToast()`) anywhere — e.g. after a save/delete action resolves.
 */
export function Toaster({ position = "top-right", gap = 10, renderToast }: ToasterProps): ReactNode {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  const ordered = isTop(position) ? toasts : [...toasts].reverse();
  return (
    <div data-bract-toaster={position} style={containerStyle(position, gap)}>
      {ordered.map((entry) =>
        renderToast
          ? <div key={entry.id} style={{ pointerEvents: "auto" }}>{renderToast(entry, () => toast.dismiss(entry.id))}</div>
          : <ToastCard key={entry.id} entry={entry} top={isTop(position)} />,
      )}
    </div>
  );
}
