/**
 * BractJS DevTools Panel (E3).
 *
 * In dev mode this module is imported by the HMR client and registers a
 * `<bractjs-devtools>` custom element.  The element reads shared state from
 * `window.__BRACTJS_DEVTOOLS__` which is populated by ClientRouter.
 *
 * Ctrl+Shift+B toggles the panel.
 * Zero production overhead — this file is never imported in production because
 * it is only loaded via `if (__BRACT_DEV__)` in the HMR client.
 */
export interface DevtoolsState {
    route: string | null;
    loaderData: Record<string, unknown>;
    navState: string;
    cacheEntries: Array<{
        key: string;
        age: number;
        staleTime: number;
        gcTime: number;
    }>;
    beforeLoadTrace: string[];
}
declare global {
    interface Window {
        __BRACTJS_DEVTOOLS__?: DevtoolsState;
    }
}
/**
 * Inject the `<bractjs-devtools>` element into the document body.
 * Called by the HMR client in dev mode.
 */
export declare function injectDevtools(): void;
/**
 * Update the shared devtools state object.
 * Called by ClientRouter on every navigation.
 */
export declare function updateDevtoolsState(state: Partial<DevtoolsState>): void;
