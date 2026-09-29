// Bridge between the router and fetchers. `useFetcher().submit` must trigger a
// loader revalidation after its mutation, but the hook module cannot import
// ClientRouter (circular); instead the router registers its revalidate
// function here on mount.

export interface RevalidationInfo {
  /** The mutation's HTTP method, when revalidation follows an action. */
  formMethod?: string;
  /** The action response status, when mutation-triggered. */
  actionStatus?: number;
  /** URL the mutation was submitted to. */
  formAction?: string;
  /** The submitted form data. */
  formData?: FormData;
  /** What the action returned. */
  actionResult?: unknown;
  /**
   * The caller's default (`<Form defaultShouldRevalidate={false}>`,
   * `fetcher.submit(…, { defaultShouldRevalidate: false })`). Passed to the
   * route's `shouldRevalidate`; routes without one follow it directly.
   */
  defaultShouldRevalidate?: boolean;
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

// The same bridge for soft navigation: fetcher redirects and `useSubmit()`
// need the router's navigate without importing ClientRouter.
type NavigateFn = (to: string, opts?: { replace?: boolean }) => Promise<void>;
let currentNavigator: NavigateFn | null = null;

/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export function registerNavigator(fn: NavigateFn | null): void {
  currentNavigator = fn;
}

/** Soft-navigate through the mounted router, or fall back to a full page load. */
export function softNavigate(to: string, opts?: { replace?: boolean }): Promise<void> {
  if (currentNavigator) return currentNavigator(to, opts);
  if (opts?.replace) window.location.replace(to);
  else window.location.assign(to);
  return Promise.resolve();
}
