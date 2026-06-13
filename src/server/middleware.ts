// ── Types ──────────────────────────────────────────────────────────────────

export interface MiddlewareContext {
  request: Request;
  params: Record<string, string>;
  context: Record<string, unknown>;
}

export type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Promise<Response>,
) => Promise<Response>;

// ── Pipeline ───────────────────────────────────────────────────────────────

export class MiddlewarePipeline {
  private fns: MiddlewareFn[] = [];

  /** Register a middleware function. Returns `this` for chaining. */
  use(fn: MiddlewareFn): this {
    this.fns.push(fn);
    return this;
  }

  /**
   * Compose all registered middleware into a single chain and execute it.
   * Each fn calls `next()` to invoke the next fn; the last `next()` calls `handler`.
   */
  run(
    ctx: MiddlewareContext,
    handler: () => Promise<Response>,
  ): Promise<Response> {
    const fns = this.fns;
    let lastCalled = -1;

    const dispatch = (i: number): Promise<Response> => {
      if (i <= lastCalled) {
        return Promise.reject(new Error("middleware: next() called more than once"));
      }
      lastCalled = i;
      if (i >= fns.length) return handler();
      const fn = fns[i];
      return fn(ctx, () => dispatch(i + 1));
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
  let lastCalled = -1;
  const dispatch = (i: number): Promise<Response> => {
    if (i <= lastCalled) {
      return Promise.reject(new Error("route middleware: next() called more than once"));
    }
    lastCalled = i;
    if (i >= fns.length) return handler();
    return fns[i](ctx, () => dispatch(i + 1));
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
  root: { middleware?: unknown };
  layouts: Array<{ middleware?: unknown }>;
  route: { middleware?: unknown };
}): RouteMiddleware[] {
  const out: RouteMiddleware[] = [];
  const add = (m: unknown) => {
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    for (const fn of list) if (typeof fn === "function") out.push(fn as RouteMiddleware);
  };
  add(chain.root.middleware);
  for (const layout of chain.layouts) add(layout.middleware);
  add(chain.route.middleware);
  return out;
}
