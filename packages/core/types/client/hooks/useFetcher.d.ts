import { type FormHTMLAttributes, type FunctionComponent, type ReactNode } from "react";
import { type FetcherState } from "../fetcher-store.ts";
interface SubmitOptions {
    method: string;
    body: FormData | Record<string, string>;
}
export interface FetcherFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "onSubmit"> {
    method?: "post" | "put" | "delete";
    action?: string;
    /** Renders a hidden `intent` input (pairs with `defineActions()`). */
    intent?: string;
    children: ReactNode;
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
    load(path: string): Promise<void>;
    submit(path: string, opts: SubmitOptions): Promise<void>;
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
export {};
