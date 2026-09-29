/** What `useSubmit()` / `fetcher.submit()` accept as the thing to submit. */
export type SubmitTarget = HTMLFormElement | HTMLButtonElement | HTMLInputElement | FormData | URLSearchParams | Record<string, unknown> | unknown[] | string | number | boolean | null;
export type SubmitEncType = "application/x-www-form-urlencoded" | "multipart/form-data" | "application/json" | "text/plain";
/** React Router submit options (the subset BractJS acts on; the rest are accepted and ignored). */
export interface SubmitOptions {
    /** URL to submit to. Default: the current URL (pathname + search). */
    action?: string;
    /** Default: the form's `method`, else `"get"`. */
    method?: string;
    /** Default: the form's `enctype`, else urlencoded (`multipart` for FormData). */
    encType?: SubmitEncType;
    /** `false` submits through a fetcher (no navigation, no history entry). */
    navigate?: boolean;
    /** With `navigate: false`: the fetcher key to report progress under. */
    fetcherKey?: string;
    /** GET submissions: replace the current history entry. */
    replace?: boolean;
    /** GET submissions: history state. */
    state?: unknown;
    /** Passed to routes' `shouldRevalidate` after the mutation (routes without one follow it). */
    defaultShouldRevalidate?: boolean;
    /** Accepted for React Router compatibility; no effect. */
    preventScrollReset?: boolean;
    /** Accepted for React Router compatibility; no effect. */
    relative?: "route" | "path";
    /** Accepted for React Router compatibility; no effect. */
    flushSync?: boolean;
    /** Accepted for React Router compatibility; no effect. */
    viewTransition?: boolean;
}
export interface NormalizedSubmission {
    /** Target URL — for GET, with the serialized fields as its query string. */
    url: string;
    /** Uppercase HTTP method. */
    method: string;
    /** Request body (null for GET). */
    body: FormData | URLSearchParams | string | null;
    /** Explicit Content-Type for string bodies (JSON / text). */
    contentType?: string;
    /** Form fields for optimistic UI, when the payload is form-shaped. */
    formData?: FormData;
    /** The parsed JSON payload, for `encType: "application/json"`. */
    json?: unknown;
    /** The raw text payload, for `encType: "text/plain"`. */
    text?: string;
}
/** Turn any React Router submit target + options into a concrete request. */
export declare function normalizeSubmission(target: SubmitTarget, options?: SubmitOptions): NormalizedSubmission;
