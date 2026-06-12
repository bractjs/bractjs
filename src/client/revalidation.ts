// Bridge between the router and fetchers. `useFetcher().submit` must trigger a
// loader revalidation after its mutation, but the hook module cannot import
// ClientRouter (circular); instead the router registers its revalidate
// function here on mount.

export interface RevalidationInfo {
  /** The mutation's HTTP method, when revalidation follows an action. */
  formMethod?: string;
  /** The action response status, when mutation-triggered. */
  actionStatus?: number;
}

type RevalidateFn = (info?: RevalidationInfo) => Promise<void>;

let currentRevalidator: RevalidateFn | null = null;

/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export function registerRevalidator(fn: RevalidateFn | null): void {
  currentRevalidator = fn;
}

/** Revalidate the active route's loaders, if a router is mounted. */
export function triggerRevalidation(info?: RevalidationInfo): Promise<void> {
  return currentRevalidator ? currentRevalidator(info) : Promise.resolve();
}
