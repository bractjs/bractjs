// Module-level toast state, shaped for React's useSyncExternalStore (mirrors
// fetcher-store.ts). Living outside component state means `toast()` is callable
// from anywhere — event handlers, fetcher callbacks, non-React code — and every
// <Toaster> in the tree observes the same queue.

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
const DEFAULT_DURATION = 4000;

class ToastStore {
  private entries = new Map<string, ToastEntry>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<Listener>();
  // Stable reference between emits or useSyncExternalStore loops.
  private snapshot: ToastEntry[] = [];
  private seq = 0;

  add(message: string, opts: ToastOptions = {}): string {
    const id = opts.id ?? `bract-toast-${++this.seq}`;
    const type = opts.type ?? "info";
    const duration = opts.duration ?? (type === "loading" ? Infinity : DEFAULT_DURATION);
    this.clearTimer(id);
    const prev = this.entries.get(id);
    this.entries.set(id, {
      id, type, message, description: opts.description, duration,
      action: opts.action, createdAt: prev?.createdAt ?? Date.now(),
    });
    this.schedule(id, duration);
    this.emit();
    return id;
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    if (this.entries.delete(id)) this.emit();
  }

  clear(): void {
    for (const id of [...this.timers.keys()]) this.clearTimer(id);
    if (this.entries.size) { this.entries.clear(); this.emit(); }
  }

  private schedule(id: string, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) return;
    this.timers.set(id, setTimeout(() => this.dismiss(id), duration));
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id);
    if (t !== undefined) { clearTimeout(t); this.timers.delete(id); }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): ToastEntry[] => this.snapshot;

  private emit(): void {
    this.snapshot = Array.from(this.entries.values());
    for (const listener of this.listeners) listener();
  }
}

export const toastStore = new ToastStore();

/** Stable server snapshot — SSR renders with no toasts. */
export const EMPTY_TOASTS: ToastEntry[] = [];

type Msg<T> = string | ((value: T) => string);
const resolve = <T,>(m: Msg<T>, v: T): string => (typeof m === "function" ? m(v) : m);
const typed = (type: ToastType) =>
  (message: string, opts?: Omit<ToastOptions, "type">): string => toastStore.add(message, { ...opts, type });

/**
 * Fire a toast from anywhere. Use the typed helpers for status feedback:
 *   toast.success("Saved"); toast.error("Delete failed");
 * `toast.promise` shows loading → success/error around an async action.
 */
export const toast = Object.assign(
  (message: string, opts?: ToastOptions): string => toastStore.add(message, opts),
  {
    success: typed("success"),
    error: typed("error"),
    info: typed("info"),
    warning: typed("warning"),
    loading: typed("loading"),
    /** Dismiss one toast by id, or all toasts when called with no id. */
    dismiss: (id?: string): void => (id ? toastStore.dismiss(id) : toastStore.clear()),
    promise<T>(
      promise: Promise<T>,
      msgs: { loading: string; success: Msg<T>; error: Msg<unknown> },
      opts?: Omit<ToastOptions, "type" | "id">,
    ): Promise<T> {
      const id = toastStore.add(msgs.loading, { ...opts, type: "loading" });
      promise.then(
        (value) => toastStore.add(resolve(msgs.success, value), { ...opts, id, type: "success" }),
        (err) => toastStore.add(resolve(msgs.error, err), { ...opts, id, type: "error" }),
      );
      return promise;
    },
  },
);

export type Toast = typeof toast;
