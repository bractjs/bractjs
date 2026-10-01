export declare const RequestIdContext: import("react").Context<string | undefined>;
/**
 * The current page's request id, from the `requestId()` middleware — show it
 * on error pages so users can quote it to support. Undefined when the
 * middleware isn't registered.
 */
export declare function useRequestId(): string | undefined;
