import { type RouteContext, withContextAccessors } from "../shared/router-context.ts";
import { instrumentRoute } from "./instrumentation.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MiddlewareContext {
  request: Request;
  params: Record<string, string>;
  /** Shared mutable context: string fields plus typed `get`/`set` (see `createContext`). */
  context: RouteContext;
}

/**
 * Call `next()` to continue, or return a `Response` to short-circuit. Returning
 * nothing (React Router style) is also fine: if `next()` was called its
 * response is used, otherwise the chain continues as if you had called it.
 */
export type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Promise<Response>,
) => Promise<Response | void> | Response | void;

/** Build a middleware context, giving `context` its typed accessors. */
export function createMiddlewareContext(
  request: Request,
  params: Record<string, string> = {},
  context: Record<string, unknown> = {},
): MiddlewareContext {
  return { request, params, context: withContextAccessors(context) };
}

/**
 * Run one middleware fn with React Router's return semantics: a returned
 * Response wins; `undefined` falls back to `next()`'s response (calling
 * `next()` on the fn's behalf if it never did).
 */
async function callMiddleware(
  fn: MiddlewareFn,
  ctx: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  let nextResult: Promise<Response> | null = null;
  // Each call goes through to `next` (whose dispatcher rejects a second call);
  // the first result is kept for the "returned nothing" fallback.
  const guardedNext = () => {
    const p = next();
    nextResult ??= p;
    return p;
  };
  const out = await fn(ctx, guardedNext);
  if (out instanceof Response) return out;
  return nextResult ?? guardedNext();
}

// ── Pipeline ───────────────────────────────────────────────────────────────

export class MiddlewarePipeline {
  private fns: MiddlewareFn[] = [];

  /** Register a middleware function. Returns `this` for chaining. */
  use(fn: MiddlewareFn): this {
    this.fns.push(fn);
    return this;
  }

  /** Remove all registered middleware. Useful for tests and for embedders that
   * rebuild the pipeline (e.g. on a hot reload). */
  clear(): this {
    this.fns = [];
    return this;
  }

  /**
   * Compose all registered middleware into a single chain and execute it.
   * Each fn calls `next()` to invoke the next fn; the last `next()` calls `handler`.
   */
  run(ctx: MiddlewareContext, handler: () => Promise<Response>): Promise<Response> {
    withContextAccessors(ctx.context);
    const fns = this.fns;
    let lastCalled = -1;

    const dispatch = (i: number): Promise<Response> => {
      if (i <= lastCalled) {
        return Promise.reject(new Error("middleware: next() called more than once"));
      }
      lastCalled = i;
      if (i >= fns.length) return handler();
      const fn = fns[i];
      return callMiddleware(fn, ctx, () => dispatch(i + 1));
    };

    return dispatch(0);
  }
}

/** Module-level default pipeline — attach middleware here via pipeline.use(). */
export const pipeline = new MiddlewarePipeline();

// ── Per-route (nested) middleware ────────────────────────────────────────────

/**
 * A route/layout/root module's `middleware` entry. Same shape as the global
 * {@link MiddlewareFn}: call `next()` to continue the chain, or return a
 * `Response` to short-circuit (auth gate, redirect). The `ctx.context` object
 * is shared and mutable — set fields on it and downstream middleware, loaders,
 * and actions see them.
 */
export type RouteMiddleware = MiddlewareFn;

/** A route middleware plus the module it came from (for instrumentation). */
type TaggedMiddleware = RouteMiddleware & { __bractRouteId?: string };

/**
 * Compose a route's nested middleware chain (root → layouts → route, in that
 * order) around `handler` and run it. Mirrors {@link MiddlewarePipeline.run}
 * but for an ad-hoc, per-request list rather than the module-level pipeline.
 * An empty list calls `handler` directly (zero overhead for routes that don't
 * use middleware).
 */
export function runRouteMiddleware(
  fns: RouteMiddleware[],
  ctx: MiddlewareContext,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (fns.length === 0) return handler();
  withContextAccessors(ctx.context);
  let lastCalled = -1;
  const dispatch = (i: number): Promise<Response> => {
    if (i <= lastCalled) {
      return Promise.reject(new Error("route middleware: next() called more than once"));
    }
    lastCalled = i;
    if (i >= fns.length) return handler();
    const fn = fns[i] as TaggedMiddleware;
    return instrumentRoute(
      "middleware",
      { request: ctx.request, params: ctx.params, context: ctx.context, id: fn.__bractRouteId ?? "route" },
      () => callMiddleware(fn, ctx, () => dispatch(i + 1)),
    );
  };
  return dispatch(0);
}

/**
 * Flatten a route chain's `middleware` exports into a single ordered list:
 * root first, then each layout outermost→innermost, then the leaf route. Each
 * module may export `middleware` as a single fn or an array; both normalize
 * here. Non-function entries are ignored defensively.
 */
export function collectRouteMiddleware(chain: {
  root: { middleware?: unknown; unstable_middleware?: unknown };
  layouts: Array<{ middleware?: unknown; unstable_middleware?: unknown }>;
  route: { middleware?: unknown; unstable_middleware?: unknown };
  files?: { root?: string; layouts: string[]; route?: string };
}): RouteMiddleware[] {
  const out: RouteMiddleware[] = [];
  const add = (mod: { middleware?: unknown; unstable_middleware?: unknown }, id: string | undefined) => {
    // React Router 7.3–7.8 exported `unstable_middleware`; read it when the
    // stable name is absent.
    const m = mod.middleware ?? mod.unstable_middleware;
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    for (const fn of list) {
      if (typeof fn !== "function") continue;
      // Wrap (don't mutate the user's fn) so the module id travels with it.
      const tagged: TaggedMiddleware = (ctx, next) => (fn as RouteMiddleware)(ctx, next);
      tagged.__bractRouteId = id;
      out.push(tagged);
    }
  };
  add(chain.root, chain.files?.root ?? "root");
  chain.layouts.forEach((layout, i) => add(layout, chain.files?.layouts[i] ?? `layout:${i}`));
  add(chain.route, chain.files?.route ?? "route");
  return out;
}
