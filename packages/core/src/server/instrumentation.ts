// Read-only observability hooks around the request pipeline — the React
// Router 8 Instrumentation API, adapted to BractJS's loader/action/middleware
// chain.
//
// An instrumentation WRAPS an operation without being able to change it: the
// wrapper receives `call()`, which runs the real work and resolves to
// `{ status: "success" }` or `{ status: "error", error }` — it never throws and
// never exposes the return value. So tracing/timing/logging code cannot alter
// a response, swallow an error, or break a request by throwing (its own throws
// are caught and logged). With nothing registered, every hook is a direct call.

import type { RouteContext } from "../shared/router-context.ts";
import { getRoutePattern } from "./request-context.ts";

/** What `call()` resolves to inside an instrumentation wrapper. */
export type InstrumentResult = { status: "success"; error: undefined } | { status: "error"; error: unknown };

/** Runs the wrapped operation. Always resolves; call it at most once. */
export type InstrumentCall = () => Promise<InstrumentResult>;

export interface InstrumentRequestInfo {
  request: Request;
  context: RouteContext;
}

export interface InstrumentRouteInfo {
  request: Request;
  params: Record<string, string>;
  context: RouteContext;
  /** appDir-relative module id ("root.tsx", "routes/blog/[id].tsx"). */
  id: string;
  /** The matched URL pattern, e.g. `/blog/:id` (React Router's `unstable_pattern`). */
  pattern?: string;
}

type Wrapper<I> = (call: InstrumentCall, info: I) => unknown;

/** The route-level operations an instrumentation can wrap. */
export interface RouteInstrumentations {
  loader?: Wrapper<InstrumentRouteInfo>;
  action?: Wrapper<InstrumentRouteInfo>;
  middleware?: Wrapper<InstrumentRouteInfo>;
}

/** The request-level operations an instrumentation can wrap. */
export interface HandlerInstrumentations {
  request?: Wrapper<InstrumentRequestInfo>;
}

/**
 * One instrumentation. Two equivalent shapes:
 *
 * - **Flat** (BractJS): `{ request, loader, action, middleware }` — applied to
 *   every request / every route.
 * - **React Router 8**: `{ handler(h) { h.instrument({ request }) }, route(r) {
 *   r.instrument({ loader, action, middleware }) } }` — `route()` is called once
 *   per route module (with `r.id`), so it can instrument selectively.
 */
export interface Instrumentation extends HandlerInstrumentations, RouteInstrumentations {
  handler?: (handler: { instrument(i: HandlerInstrumentations): void }) => void;
  route?: (route: { id: string; instrument(i: RouteInstrumentations): void }) => void;
}

// ── Registry ────────────────────────────────────────────────────────────────

const registered: Instrumentation[] = [];
let handlerWrappers: Array<Wrapper<InstrumentRequestInfo>> | null = null;
const routeWrappers = new Map<
  string,
  Required<{ [K in keyof RouteInstrumentations]: Wrapper<InstrumentRouteInfo>[] }>
>();

/**
 * Register instrumentations. Call from `app/server.ts` (runs in dev, `start`,
 * and the compiled binary) or list them in `app/lifecycle.ts` as
 * `instrumentations: [...]`. Returns an unregister function.
 *
 * ```ts
 * instrument({
 *   async loader(call, { id, request }) {
 *     const t = performance.now();
 *     const { status } = await call();
 *     console.log(id, status, performance.now() - t, "ms");
 *   },
 * });
 * ```
 */
export function instrument(...instrumentations: Instrumentation[]): () => void {
  registered.push(...instrumentations);
  invalidate();
  return () => {
    for (const i of instrumentations) {
      const idx = registered.indexOf(i);
      if (idx !== -1) registered.splice(idx, 1);
    }
    invalidate();
  };
}

/** Remove every registered instrumentation (tests, hot reload). */
export function clearInstrumentations(): void {
  registered.length = 0;
  invalidate();
}

/** True when anything is registered — lets hot paths skip all wrapping. */
export function hasInstrumentations(): boolean {
  return registered.length > 0;
}

function invalidate(): void {
  handlerWrappers = null;
  routeWrappers.clear();
}

function safeCallback(fn: () => void, what: string): void {
  try {
    fn();
  } catch (err) {
    console.error(`[bractjs] instrumentation ${what}() threw:`, err);
  }
}

function getHandlerWrappers(): Array<Wrapper<InstrumentRequestInfo>> {
  if (handlerWrappers) return handlerWrappers;
  const out: Array<Wrapper<InstrumentRequestInfo>> = [];
  for (const i of registered) {
    if (i.request) out.push(i.request);
    if (i.handler) {
      const h = i.handler;
      safeCallback(
        () =>
          h({
            instrument: (hi) => {
              if (hi.request) out.push(hi.request);
            },
          }),
        "handler",
      );
    }
  }
  handlerWrappers = out;
  return out;
}

function getRouteWrappers(id: string) {
  let entry = routeWrappers.get(id);
  if (entry) return entry;
  const e = { loader: [], action: [], middleware: [] } as {
    loader: Wrapper<InstrumentRouteInfo>[];
    action: Wrapper<InstrumentRouteInfo>[];
    middleware: Wrapper<InstrumentRouteInfo>[];
  };
  const add = (ri: RouteInstrumentations) => {
    if (ri.loader) e.loader.push(ri.loader);
    if (ri.action) e.action.push(ri.action);
    if (ri.middleware) e.middleware.push(ri.middleware);
  };
  for (const i of registered) {
    add(i);
    if (i.route) {
      const r = i.route;
      safeCallback(() => r({ id, instrument: add }), "route");
    }
  }
  entry = e;
  routeWrappers.set(id, entry);
  return entry;
}

// ── Runner ──────────────────────────────────────────────────────────────────

/**
 * Run `fn` inside `wrappers` (first registered = outermost). The operation runs
 * exactly once even if a wrapper forgets to call `call()`, and its real
 * result/throw is what the caller sees — wrappers only observe.
 */
async function runWrapped<T, I>(wrappers: Array<Wrapper<I>>, info: I, fn: () => Promise<T>): Promise<T> {
  if (wrappers.length === 0) return fn();
  let ran = false;
  let value: T | undefined;
  let failed = false;
  let error: unknown;
  let inner: Promise<InstrumentResult> | null = null;
  const runOnce = (): Promise<InstrumentResult> => {
    if (!inner) {
      ran = true;
      inner = fn().then(
        (v): InstrumentResult => {
          value = v;
          return { status: "success", error: undefined };
        },
        (err: unknown): InstrumentResult => {
          failed = true;
          error = err;
          return { status: "error", error: err };
        },
      );
    }
    return inner;
  };

  const dispatch = (i: number): Promise<InstrumentResult> => {
    if (i >= wrappers.length) return runOnce();
    let called: Promise<InstrumentResult> | null = null;
    const call: InstrumentCall = () => (called ??= dispatch(i + 1));
    return Promise.resolve()
      .then(() => wrappers[i](call, info))
      .catch((err: unknown) => {
        console.error("[bractjs] instrumentation threw:", err);
      })
      .then(() => call());
  };

  await dispatch(0);
  if (!ran) await runOnce();
  if (failed) throw error;
  return value as T;
}

/** Wrap one whole request (after the dev-host guard, around global middleware). */
export function instrumentRequest(
  info: InstrumentRequestInfo,
  fn: () => Promise<Response>,
): Promise<Response> {
  if (registered.length === 0) return fn();
  return runWrapped(getHandlerWrappers(), info, fn);
}

/** Wrap one route-level operation for the module `info.id`. */
export function instrumentRoute<T>(
  kind: keyof RouteInstrumentations,
  info: InstrumentRouteInfo,
  fn: () => Promise<T>,
): Promise<T> {
  if (registered.length === 0) return fn();
  const withPattern = info.pattern === undefined ? { ...info, pattern: getRoutePattern() } : info;
  return runWrapped(getRouteWrappers(info.id)[kind], withPattern, fn);
}
