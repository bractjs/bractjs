import {
  createElement, useCallback, useEffect, useId, useMemo, useSyncExternalStore,
  type FormEvent, type FormHTMLAttributes, type FunctionComponent, type ReactNode,
} from "react";
import { toSamePath } from "../nav-utils.ts";
import { fetcherStore, type FetcherState } from "../fetcher-store.ts";
import { triggerRevalidation } from "../revalidation.ts";

// ── Types ──────────────────────────────────────────────────────────────────

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

interface StreamFetcherResult<T = unknown> {
  /** @deprecated Never emitted — call `connect(actionId)` instead. Removed in 0.2. */
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

// ── SSE async generator ────────────────────────────────────────────────────

async function* sseStream<T>(actionId: string): AsyncGenerator<T> {
  // Send X-BractJS-Action so the server's CSRF gate accepts this same-origin
  // GET. Cross-origin <script>/<img>/<link rel=prefetch> tags cannot set this
  // header, so the gate blocks CSRF invocations of server actions.
  const res = await fetch(`/_stream?id=${encodeURIComponent(actionId)}`, {
    headers: { "X-BractJS-Action": "1" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`[bractjs] /_stream ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.trim().split("\n");
        let event = "data";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (event === "done") return;
        if (event === "error") throw new Error((JSON.parse(data) as { message: string }).message);
        if (event === "data" && data) yield JSON.parse(data) as T;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

const EMPTY_ENTRY = undefined;

export function useFetcher(opts?: { key?: string }): FetcherResult;
export function useFetcher<T>(opts: { stream: true }): StreamFetcherResult<T>;
export function useFetcher<T = unknown>(opts?: UseFetcherOptions): FetcherResult | StreamFetcherResult<T> {
  // All hooks run unconditionally — branching on opts.stream happens only in
  // the returned value, so the rules of hooks hold for every variant.
  const autoKey = useId();
  const key = opts?.key ?? `__fetcher${autoKey}`;

  const entry = useSyncExternalStore(
    fetcherStore.subscribe,
    () => fetcherStore.get(key),
    () => EMPTY_ENTRY,
  );

  // Unkeyed fetchers disappear from useFetchers() with their component; keyed
  // ones persist so optimistic state survives remounts.
  const isKeyed = opts?.key !== undefined;
  useEffect(() => {
    if (isKeyed) return;
    return () => fetcherStore.remove(key);
  }, [key, isKeyed]);

  const load = useCallback(async (path: string): Promise<void> => {
    fetcherStore.update(key, { state: "loading" });
    try {
      const res = await fetch(`/_data?path=${encodeURIComponent(path)}`);
      const json = (await res.json()) as { route?: unknown };
      fetcherStore.update(key, { data: json.route });
    } finally {
      fetcherStore.update(key, { state: "idle" });
    }
  }, [key]);

  const submit = useCallback(async (path: string, submitOpts: SubmitOptions): Promise<void> => {
    const body =
      submitOpts.body instanceof FormData
        ? submitOpts.body
        : new URLSearchParams(submitOpts.body as Record<string, string>);
    const formMethod = submitOpts.method.toUpperCase();
    // Expose the submission BEFORE the fetch — this is what optimistic UI
    // renders while the mutation is in flight.
    fetcherStore.update(key, {
      state: "submitting",
      formData: submitOpts.body instanceof FormData ? submitOpts.body : undefined,
      formMethod,
    });
    try {
      // Send the custom header so the server's CSRF gate accepts this
      // same-origin mutation (browsers block it cross-origin without a CORS
      // preflight). Without it every fetcher submit 403s.
      const res = await fetch(path, {
        method: formMethod,
        body,
        headers: { "X-BractJS-Action": "1" },
      });
      // If the action redirected, do a real navigation rather than parsing the
      // redirect target as JSON. Off-origin targets get a full-page nav so we
      // never follow an attacker-controlled Location inside the SPA.
      if (res.redirected) {
        const to = toSamePath(res.url);
        window.location.assign(to ?? res.url);
        return;
      }
      fetcherStore.update(key, { data: await res.json() });
      // Mutations invalidate loader data — re-run the active route's loaders
      // (gated by its shouldRevalidate) so the page reflects the change.
      fetcherStore.update(key, { state: "loading" });
      await triggerRevalidation({ formMethod, actionStatus: res.status });
    } finally {
      fetcherStore.update(key, { state: "idle", formData: undefined });
    }
  }, [key]);

  // Stable component identity across renders (remounting a form on every
  // render would drop focus/IME state).
  const FetcherForm = useMemo<FunctionComponent<FetcherFormProps>>(() => {
    return function FetcherFormImpl({ method = "post", action, intent, children, ...rest }: FetcherFormProps) {
      function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const target = e.currentTarget;
        const url = action ?? window.location.pathname + window.location.search;
        void submit(url, { method, body: new FormData(target) });
      }
      const intentInput = intent !== undefined
        ? createElement("input", { key: "__bract_intent", type: "hidden", name: "intent", value: intent })
        : null;
      return createElement("form", { method, onSubmit: handleSubmit, ...rest }, intentInput, children);
    };
  }, [submit]);

  if (opts?.stream) {
    return {
      events: (null as unknown) as AsyncGenerator<T>,
      connect(actionId: string): AsyncGenerator<T> {
        return sseStream<T>(actionId);
      },
    } satisfies StreamFetcherResult<T>;
  }

  return {
    data: entry?.data,
    state: entry?.state ?? "idle",
    formData: entry?.formData,
    formMethod: entry?.formMethod,
    key,
    load,
    submit,
    Form: FetcherForm,
  };
}
