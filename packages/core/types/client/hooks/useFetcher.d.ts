import { type FormHTMLAttributes, type FunctionComponent, type ReactNode } from "react";
import { type FetcherState } from "../fetcher-store.ts";
import { type SubmitOptions as RRSubmitOptions, type SubmitTarget } from "../submission.ts";
/** BractJS form: `fetcher.submit(url, { method, body })`. */
interface SubmitOptions {
    method: string;
    body?: FormData | URLSearchParams | Record<string, string>;
    /** Passed to routes' `shouldRevalidate` after the action (routes without one follow it). */
    defaultShouldRevalidate?: boolean;
}
export interface FetcherFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "onSubmit"> {
    /** `"get"` loads `action` (with the form's fields as its query) through the fetcher. */
    method?: "get" | "post" | "put" | "patch" | "delete";
    action?: string;
    /** Renders a hidden `intent` input (pairs with `defineActions()`). */
    intent?: string;
    /** See `SubmitOptions.defaultShouldRevalidate`. */
    defaultShouldRevalidate?: boolean;
    children: ReactNode;
}
/** The request a fetcher submission sends (after normalizing either call form). */
export interface FetcherRequest {
    url: string;
    method: string;
    body: FormData | URLSearchParams | string | null;
    contentType?: string;
    formData?: FormData;
    defaultShouldRevalidate?: boolean;
}
export interface FetcherResult {
    data: unknown;
    state: FetcherState;
    /** The submitted FormData while a submission is in flight — the optimistic-UI source. */
    formData?: FormData;
    /** Uppercase method of the in-flight/last submission. */
    formMethod?: string;
    /** This fetcher's identity (explicit `key` option, or component-bound). */
    key: string;
    /** Load a route's loader data into `fetcher.data` (the route slice of `/_data`). */
    load(path: string, opts?: {
        flushSync?: boolean;
    }): Promise<void>;
    /**
     * Submit a mutation. Two call forms:
     * - BractJS: `submit(url, { method, body })` — the URL comes first.
     * - React Router: `submit(target, { method, action, encType })` — `target`
     *   is a FormData, URLSearchParams, plain object, form element, or (with
     *   `encType: "application/json"`) any JSON value.
     */
    submit(path: string, opts: SubmitOptions): Promise<void>;
    submit(target: SubmitTarget, opts?: RRSubmitOptions): Promise<void>;
    /**
     * Clear this fetcher back to idle — `data`, `formData` and `formMethod`
     * become undefined (React Router 8 `fetcher.reset()`).
     */
    reset(opts?: {
        reason?: unknown;
    }): void;
    /** A `<fetcher.Form>` that submits through this fetcher (no navigation, no history). */
    Form: FunctionComponent<FetcherFormProps>;
}
export interface StreamFetcherResult<T = unknown> {
    /** @deprecated Never emitted — call `connect(actionId)` instead. Removal planned for 0.3. */
    events: AsyncGenerator<T>;
    connect(actionId: string): AsyncGenerator<T>;
}
export interface UseFetcherOptions {
    /**
     * Give the fetcher a stable identity. Keyed fetchers persist across
     * unmounts and are shared by every component using the same key; unkeyed
     * fetchers are removed from `useFetchers()` when their component unmounts.
     */
    key?: string;
    stream?: boolean;
}
export declare function useFetcher(opts?: {
    key?: string;
}): FetcherResult;
export declare function useFetcher<T>(opts: {
    stream: true;
}): StreamFetcherResult<T>;
/** Load a route's loader data into the fetcher `key`. */
export declare function fetcherLoad(key: string, path: string): Promise<void>;
/** Run a submission through the fetcher `key` (a GET becomes a load). */
export declare function fetcherSubmit(key: string, req: FetcherRequest): Promise<void>;
export {};
