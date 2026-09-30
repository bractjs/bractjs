// app/ui.tsx — shared UI building blocks, styled with Tailwind utility classes.
//
// Primitives are exported as className strings (`className={input}`) or tiny
// components, so each route stays a single readable file. The design tokens
// (canvas, surface, ink, teal, marigold, …) live in app/styles.css.

import { toast } from "@bractjs/bractjs";
import type { LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from "react";

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

export const panel = "rounded-lg border border-line bg-surface";

export const input =
  "h-11 w-full min-w-0 rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:border-teal";

const buttonBase =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60";

const buttonTones = {
  primary: "bg-teal text-teal-ink hover:bg-ink hover:text-canvas",
  ghost: "border border-line bg-surface text-ink hover:border-ink",
  danger: "border border-line bg-surface text-danger hover:border-danger hover:bg-danger hover:text-surface",
} as const;

export function Button({
  tone = "ghost",
  icon: Icon,
  spin = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof buttonTones;
  icon?: LucideIcon;
  /** Spin the icon (a pending state). Still under reduced motion. */
  spin?: boolean;
}) {
  return (
    <button type="button" className={`${buttonBase} ${buttonTones[tone]} ${className}`} {...rest}>
      {Icon ? (
        <Icon
          aria-hidden
          size={16}
          strokeWidth={2.25}
          className={spin ? "animate-spin motion-reduce:animate-none" : undefined}
        />
      ) : null}
      {children}
    </button>
  );
}

/** A square, icon-only button; `label` is its accessible name. */
export function IconButton({
  icon: Icon,
  label,
  tone = "ghost",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: "ghost" | "danger";
}) {
  const tones = {
    ghost: "text-muted hover:bg-sunken hover:text-ink",
    danger: "text-muted hover:bg-danger hover:text-surface",
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-9 shrink-0 place-items-center rounded-md transition-colors ${tones[tone]} ${className}`}
      {...rest}
    >
      <Icon aria-hidden size={18} strokeWidth={2.25} />
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 rounded-md bg-danger px-3 py-2 text-sm font-medium text-surface">
      {children}
    </p>
  );
}
