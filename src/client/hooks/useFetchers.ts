import { useSyncExternalStore } from "react";
import { fetcherStore, EMPTY_FETCHERS, type FetcherEntry } from "../fetcher-store.ts";

/**
 * Every active fetcher (keyed and mounted-unkeyed alike) — the cross-component
 * view for optimistic UI. Example: a table dims each row whose keyed delete
 * fetcher (`useFetcher({ key: "delete-" + id })`) is currently submitting:
 *
 *   const deleting = new Set(
 *     useFetchers()
 *       .filter((f) => f.state === "submitting" && f.key.startsWith("delete-"))
 *       .map((f) => f.key.slice("delete-".length)),
 *   );
 *
 * SSR-safe: renders an empty list on the server.
 */
export function useFetchers(): FetcherEntry[] {
  return useSyncExternalStore(
    fetcherStore.subscribe,
    fetcherStore.getSnapshot,
    () => EMPTY_FETCHERS,
  );
}
