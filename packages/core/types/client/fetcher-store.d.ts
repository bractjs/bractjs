export type FetcherState = "idle" | "loading" | "submitting";
export interface FetcherEntry {
    key: string;
    state: FetcherState;
    data: unknown;
    /** The submitted form data, available from the moment submit() is called — read this for optimistic UI. */
    formData?: FormData;
    /** Uppercase HTTP method of the in-flight/last submission. */
    formMethod?: string;
}
type Listener = () => void;
declare class FetcherStore {
    private entries;
    private listeners;
    private snapshot;
    get(key: string): FetcherEntry | undefined;
    update(key: string, partial: Partial<Omit<FetcherEntry, "key">>): void;
    remove(key: string): void;
    subscribe: (listener: Listener) => (() => void);
    /** All current entries (stable reference between updates). */
    getSnapshot: () => FetcherEntry[];
    private emit;
}
export declare const fetcherStore: FetcherStore;
/** Stable server snapshot — SSR renders with no active fetchers. */
export declare const EMPTY_FETCHERS: FetcherEntry[];
export {};
