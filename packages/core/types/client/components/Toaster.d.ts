import { type ReactNode } from "react";
import type { ToastEntry } from "../toast-store.ts";
export type ToastPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
export interface ToasterProps {
    position?: ToastPosition;
    /** Gap between stacked toasts, px. */
    gap?: number;
    /** Custom renderer — receives the entry and a dismiss callback. Falls back to the default card. */
    renderToast?: (toast: ToastEntry, dismiss: () => void) => ReactNode;
}
/**
 * Renders the active toast queue. Mount once in root.tsx, then call `toast.*`
 * (or `useToast()`) anywhere — e.g. after a save/delete action resolves.
 */
export declare function Toaster({ position, gap, renderToast }: ToasterProps): ReactNode;
