export type ToastType = "success" | "error" | "info" | "warning" | "loading";
export interface ToastAction {
    label: string;
    onClick: () => void;
}
export interface ToastEntry {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
    /** ms before auto-dismiss; `Infinity`/`0` keeps it until dismissed. */
    duration: number;
    action?: ToastAction;
    createdAt: number;
}
export interface ToastOptions {
    /** Reuse an id to update an existing toast in place (e.g. loading → success). */
    id?: string;
    type?: ToastType;
    description?: string;
    duration?: number;
    action?: ToastAction;
}
type Listener = () => void;
declare class ToastStore {
    private entries;
    private timers;
    private listeners;
    private snapshot;
    private seq;
    add(message: string, opts?: ToastOptions): string;
    dismiss(id: string): void;
    clear(): void;
    private schedule;
    private clearTimer;
    subscribe: (listener: Listener) => (() => void);
    getSnapshot: () => ToastEntry[];
    private emit;
}
export declare const toastStore: ToastStore;
/** Stable server snapshot — SSR renders with no toasts. */
export declare const EMPTY_TOASTS: ToastEntry[];
type Msg<T> = string | ((value: T) => string);
/**
 * Fire a toast from anywhere. Use the typed helpers for status feedback:
 *   toast.success("Saved"); toast.error("Delete failed");
 * `toast.promise` shows loading → success/error around an async action.
 */
export declare const toast: ((message: string, opts?: ToastOptions) => string) & {
    success: (message: string, opts?: Omit<ToastOptions, "type">) => string;
    error: (message: string, opts?: Omit<ToastOptions, "type">) => string;
    info: (message: string, opts?: Omit<ToastOptions, "type">) => string;
    warning: (message: string, opts?: Omit<ToastOptions, "type">) => string;
    loading: (message: string, opts?: Omit<ToastOptions, "type">) => string;
    /** Dismiss one toast by id, or all toasts when called with no id. */
    dismiss: (id?: string) => void;
    promise<T>(promise: Promise<T>, msgs: {
        loading: string;
        success: Msg<T>;
        error: Msg<unknown>;
    }, opts?: Omit<ToastOptions, "type" | "id">): Promise<T>;
};
export type Toast = typeof toast;
export {};
