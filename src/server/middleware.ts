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
