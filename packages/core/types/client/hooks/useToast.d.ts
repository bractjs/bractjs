import { type Toast, type ToastEntry } from "../toast-store.ts";
/** The stable `toast` API — `toast.success(...)`, `toast.error(...)`, `toast.promise(...)`. */
export declare function useToast(): Toast;
/** Reactive list of active toasts. <Toaster> uses this; expose it to build a custom renderer. */
export declare function useToasts(): ToastEntry[];
