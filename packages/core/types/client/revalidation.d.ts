export interface RevalidationInfo {
    /** The mutation's HTTP method, when revalidation follows an action. */
    formMethod?: string;
    /** The action response status, when mutation-triggered. */
    actionStatus?: number;
}
type RevalidateFn = (info?: RevalidationInfo) => Promise<void>;
/** Called by ClientRouter on mount/unmount. Not part of the public API. */
export declare function registerRevalidator(fn: RevalidateFn | null): void;
/** Revalidate the active route's loaders, if a router is mounted. */
export declare function triggerRevalidation(info?: RevalidationInfo): Promise<void>;
export {};
