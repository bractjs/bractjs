import { useSyncExternalStore } from "react";
import { toast, toastStore, EMPTY_TOASTS, type Toast, type ToastEntry } from "../toast-store.ts";

/** The stable `toast` API — `toast.success(...)`, `toast.error(...)`, `toast.promise(...)`. */
export function useToast(): Toast {
  return toast;
}

/** Reactive list of active toasts. <Toaster> uses this; expose it to build a custom renderer. */
export function useToasts(): ToastEntry[] {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, () => EMPTY_TOASTS);
}
