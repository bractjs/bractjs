// Module-level fetcher state, shaped for React's useSyncExternalStore. Giving
// fetchers identity outside component state is what makes optimistic UI work:
// a keyed fetcher survives remounts, and `useFetchers()` lets any component
// observe every in-flight mutation (e.g. dim a list row while its delete
// fetcher is submitting elsewhere in the tree).

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

const IDLE_ENTRY: Omit<FetcherEntry, "key"> = { state: "idle", data: undefined };

class FetcherStore {
  private entries = new Map<string, FetcherEntry>();
  private listeners = new Set<Listener>();
  // Snapshots must be referentially stable between emits or
  // useSyncExternalStore loops. Rebuilt only inside emit().
  private snapshot: FetcherEntry[] = [];

  get(key: string): FetcherEntry | undefined {
    return this.entries.get(key);
  }

  update(key: string, partial: Partial<Omit<FetcherEntry, "key">>): void {
    const prev = this.entries.get(key) ?? { key, ...IDLE_ENTRY };
    this.entries.set(key, { ...prev, ...partial });
    this.emit();
  }

  remove(key: string): void {
    if (this.entries.delete(key)) this.emit();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** All current entries (stable reference between updates). */
  getSnapshot = (): FetcherEntry[] => this.snapshot;

  private emit(): void {
    this.snapshot = Array.from(this.entries.values());
    for (const listener of this.listeners) listener();
  }
}

export const fetcherStore = new FetcherStore();

/** Stable server snapshot — SSR renders with no active fetchers. */
export const EMPTY_FETCHERS: FetcherEntry[] = [];
