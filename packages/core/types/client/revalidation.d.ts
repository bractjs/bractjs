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
    /** Commit the fresh data inside a View Transition. */
    viewTransition?: boolean;
}
type RevalidateFn = (info?: RevalidationInfo) => Promise<void>;
/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export declare function registerRevalidator(fn: RevalidateFn | null): void;
/** Revalidate the active route's loaders, if a router is mounted. */
export declare function triggerRevalidation(info?: RevalidationInfo): Promise<void>;
type NavigateFn = (to: string, opts?: {
    replace?: boolean;
}) => Promise<void>;
/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export declare function registerNavigator(fn: NavigateFn | null): void;
/** Soft-navigate through the mounted router, or fall back to a full page load. */
export declare function softNavigate(to: string, opts?: {
    replace?: boolean;
}): Promise<void>;
export {};
