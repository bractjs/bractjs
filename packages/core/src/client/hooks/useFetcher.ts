import {
  createElement,
  type FormEvent,
  type FormHTMLAttributes,
  type FunctionComponent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  applyClientLoaders,
  createClientContext,
  resolveClientChain,
  runClientMiddleware,
} from "../client-data.ts";
import { reviveDeferred } from "../deferred-revive.ts";
import { type FetcherState, fetcherStore } from "../fetcher-store.ts";
import { assignExternal, readActionBody, toSamePath } from "../nav-utils.ts";
import { softNavigate, triggerRevalidation } from "../revalidation.ts";
import { type ResolveToFn, useResolveTo } from "./useResolveTo.ts";
import {
  normalizeSubmission,
  type SubmitOptions as RRSubmitOptions,
  type SubmitTarget,
} from "../submission.ts";

// ── Types ──────────────────────────────────────────────────────────────────

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
  /** How a relative `action` resolves: against this component's route (default) or the URL's path segments. */
  relative?: "route" | "path";
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
  load(path: string, opts?: { flushSync?: boolean }): Promise<void>;
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
  reset(opts?: { reason?: unknown }): void;
  /** A `<fetcher.Form>` that submits through this fetcher (no navigation, no history). */
  Form: FunctionComponent<FetcherFormProps>;
}

export interface StreamFetcherResult<T = unknown> {
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

/** @internal Exported for tests. */
export async function* sseStream<T>(actionId: string): AsyncGenerator<T> {
  // Send X-BractJS-Action so the server's CSRF gate accepts this same-origin
  // GET. Cross-origin <script>/<img>/<link rel=prefetch> tags cannot set this
  // header, so the gate blocks CSRF invocations of server actions.
  const res = await fetch(`/_stream?id=${encodeURIComponent(actionId)}`, {
    headers: { "X-BractJS-Action": "1" },
  });
  // A route-middleware redirect (e.g. to /login) arrives as the 204 envelope:
  // follow it like an action redirect, and end the stream with no values.
  const redirectTo = res.headers.get("X-BractJS-Redirect");
  if (redirectTo !== null) {
    const safe = toSamePath(redirectTo);
    if (safe) void softNavigate(safe);
    else assignExternal(redirectTo);
    return;
  }
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
    // Cancel, not just release: when the consumer stops early (`break`, an
    // unmount) this aborts the HTTP body, so the server stops the generator.
    await reader.cancel().catch(() => {});
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

  // fetcher.load(href) / submit(…, { action }) / <fetcher.Form action> resolve a
  // relative target against this component's route, as React Router does.
  // Read through a ref: `load`, `submit` and `fetcher.Form` must keep their
  // identity across renders (a new Form component type would remount the form
  // and drop typed input; effects keyed on load/submit would re-fire).
  const resolve = useResolveTo();
  const resolveRef = useRef<ResolveToFn>(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);
  const load = useCallback(
    (path: string): Promise<void> => fetcherLoad(key, resolveRef.current(path)),
    [key],
  );

  const submit = useCallback(
    (target: SubmitTarget | string, submitOpts?: SubmitOptions | RRSubmitOptions): Promise<void> =>
      fetcherSubmit(key, toFetcherRequest(target, submitOpts, resolveRef.current)),
    [key],
  ) as FetcherResult["submit"];

  const reset = useCallback(() => fetcherStore.reset(key), [key]);

  // Stable component identity across renders (remounting a form on every
  // render would drop focus/IME state).
  const FetcherForm = useMemo<FunctionComponent<FetcherFormProps>>(() => {
    return function FetcherFormImpl({
      method = "post",
      action,
      intent,
      defaultShouldRevalidate,
      relative,
      children,
      ...rest
    }: FetcherFormProps) {
      function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const target = e.currentTarget;
        const url =
          action !== undefined
            ? resolveRef.current(action, relative)
            : window.location.pathname + window.location.search;
        if (method === "get") {
          // React Router: a GET fetcher form loads `action?<fields>`.
          void load(normalizeSubmission(new FormData(target), { action: url, method: "get" }).url);
          return;
        }
        void submit(url, { method, body: new FormData(target), defaultShouldRevalidate });
      }
      const intentInput =
        intent !== undefined
          ? createElement("input", { key: "__bract_intent", type: "hidden", name: "intent", value: intent })
          : null;
      return createElement("form", { method, onSubmit: handleSubmit, ...rest }, intentInput, children);
    };
  }, [submit, load]);

  if (opts?.stream) {
    return {
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
    reset,
    Form: FetcherForm,
  };
}

// ── Fetcher operations (shared with useSubmit({ navigate: false })) ────────

/** Normalize either submit call form into one request. */
function toFetcherRequest(
  target: SubmitTarget | string,
  opts?: SubmitOptions | RRSubmitOptions,
  resolve: ResolveToFn = (to) => (typeof to === "string" ? to : ""),
): FetcherRequest {
  const rr = opts as RRSubmitOptions | undefined;
  const isTextual = rr?.encType === "application/json" || rr?.encType === "text/plain";
  if (typeof target === "string" && !isTextual) {
    // BractJS form: submit(url, { method, body }).
    const o = (opts ?? { method: "post" }) as SubmitOptions;
    const body =
      o.body === undefined
        ? new URLSearchParams()
        : o.body instanceof FormData || o.body instanceof URLSearchParams
          ? o.body
          : new URLSearchParams(o.body);
    return {
      url: resolve(target),
      method: (o.method ?? "post").toUpperCase(),
      body,
      formData: body instanceof FormData ? body : undefined,
      defaultShouldRevalidate: o.defaultShouldRevalidate,
    };
  }
  // React Router form: submit(target, { method, action, encType }).
  const n = normalizeSubmission(target, { method: "post", ...rr }, (action) => resolve(action, rr?.relative));
  return {
    url: n.url,
    method: n.method,
    body: n.body,
    contentType: n.contentType,
    formData: n.formData,
    defaultShouldRevalidate: rr?.defaultShouldRevalidate,
  };
}

/**
 * Load a route's loader data into the fetcher `key` — through the route's
 * clientMiddleware and clientLoader, as a navigation would.
 */
export async function fetcherLoad(key: string, path: string): Promise<void> {
  fetcherStore.update(key, { state: "loading" });
  try {
    const { chain } = await resolveClientChain(path);
    const request = new Request(new URL(path, window.location.origin));
    const context = createClientContext();
    const data = await runClientMiddleware(chain, { request, params: {}, context }, async () => {
      const res = await fetch(`/_data?path=${encodeURIComponent(path)}`);
      // A gate redirect (204 envelope) or a raw 3xx: follow it, load nothing.
      if (followRedirectResponse(res)) return undefined;
      // A 404/5xx body is not a payload — leave the fetcher's data untouched.
      if (!res.ok) {
        console.error(`[bractjs] fetcher.load /_data ${res.status} for ${path}`);
        return undefined;
      }
      const json = reviveDeferred((await res.json()) as Record<string, unknown>);
      // Only the route's own clientLoader applies — a fetcher reads one route.
      await applyClientLoaders({ root: null, layouts: [], route: chain.route }, json, {
        request,
        params: (json.params as Record<string, string>) ?? {},
        search: (json.search as Record<string, unknown>) ?? {},
        context,
      });
      return json.route;
    });
    if (data !== undefined) fetcherStore.patch(key, { data });
  } catch (err) {
    // A redirect thrown (or returned) by the route's clientMiddleware or
    // clientLoader: follow it like a navigation would, load nothing.
    if (!followThrownRedirect(err)) throw err;
  } finally {
    fetcherStore.patch(key, { state: "idle" });
  }
}

/**
 * Follow a `throw redirect(…)` from client code (a Response with a Location).
 * Same-origin targets navigate; anything else goes through `assignExternal`,
 * which refuses script URLs. Returns false when `err` is not a redirect.
 */
function followThrownRedirect(err: unknown): boolean {
  const loc = err instanceof Response ? err.headers.get("Location") : null;
  if (!loc) return false;
  const safe = toSamePath(loc);
  if (safe) window.location.assign(safe);
  else assignExternal(loc);
  return true;
}

/**
 * Follow a submission's redirect, if it has one: the enveloped form (204 +
 * X-BractJS-Redirect — the server converts the action's 3xx so no throwaway
 * document GET consumes one-shot cookies like flash toasts), or a 3xx fetch()
 * followed. Off-origin targets get a full-page navigation so an
 * attacker-controlled Location is never followed inside the SPA.
 */
function followRedirectResponse(res: Response): boolean {
  const envelope = res.headers.get("X-BractJS-Redirect");
  if (envelope !== null) {
    const to = toSamePath(envelope);
    if (to) {
      if (res.headers.get("X-BractJS-Replace") !== null) window.location.replace(to);
      else window.location.assign(to);
    } else assignExternal(envelope);
    return true;
  }
  if (res.redirected) {
    window.location.assign(toSamePath(res.url) ?? res.url);
    return true;
  }
  return false;
}

/** A GET submission carries its fields in the query string (`submit("/search", { method: "get", body: { q } })`). */
function withQuery(url: string, body: FetcherRequest["body"]): string {
  if (!body || typeof body === "string") return url;
  const [path, existing = ""] = url.split("?");
  const params = new URLSearchParams(existing);
  for (const [name, value] of body.entries()) if (typeof value === "string") params.append(name, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Run a submission through the fetcher `key` (a GET becomes a load). */
export async function fetcherSubmit(key: string, req: FetcherRequest): Promise<void> {
  if (req.method === "GET") return fetcherLoad(key, withQuery(req.url, req.body));
  const formMethod = req.method;
  // Expose the submission BEFORE the fetch — this is what optimistic UI
  // renders while the mutation is in flight.
  fetcherStore.update(key, { state: "submitting", formData: req.formData, formMethod });
  try {
    // Send the custom header so the server's CSRF gate accepts this
    // same-origin mutation (browsers block it cross-origin without a CORS
    // preflight). Without it every fetcher submit 403s.
    const headers: Record<string, string> = { "X-BractJS-Action": "1" };
    if (req.contentType) headers["Content-Type"] = req.contentType;
    // The target route's clientMiddleware wraps the submission; its
    // clientAction (when it has one) decides whether to call the server.
    const { chain } = await resolveClientChain(req.url);
    const clientAction = chain.route?.clientAction;
    const request = new Request(new URL(req.url, window.location.origin), { method: formMethod });
    const context = createClientContext();
    const REDIRECTED = Symbol("redirected");
    let actionStatus = 200;
    const serverAction = async (): Promise<unknown> => {
      const res = await fetch(req.url, { method: formMethod, body: req.body, headers });
      actionStatus = res.status;
      if (followRedirectResponse(res)) return REDIRECTED;
      // data(null, { status: 204 }) — no body to parse.
      if (res.status === 204) return null;
      return readActionBody(res);
    };
    let data: unknown;
    try {
      data = await runClientMiddleware(chain, { request, params: {}, context }, async () =>
        typeof clientAction === "function"
          ? clientAction({
              request,
              params: {},
              formData: req.formData ?? new FormData(),
              context,
              serverAction,
            })
          : serverAction(),
      );
    } catch (err) {
      // `throw redirect(...)` from clientMiddleware or a clientAction.
      if (!followThrownRedirect(err)) throw err;
      return;
    }
    if (data === REDIRECTED) return;
    fetcherStore.patch(key, { data });
    // Mutations invalidate loader data — re-run the active route's loaders
    // (gated by its shouldRevalidate) so the page reflects the change.
    fetcherStore.patch(key, { state: "loading" });
    await triggerRevalidation({
      formMethod,
      actionStatus,
      formAction: req.url,
      formData: req.formData,
      actionResult: data,
      defaultShouldRevalidate: req.defaultShouldRevalidate,
    });
  } finally {
    fetcherStore.patch(key, { state: "idle", formData: undefined });
  }
}
