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
    let index = 0;
    const fns = this.fns;

    const dispatch = (): Promise<Response> => {
      if (index >= fns.length) return handler();
      const fn = fns[index++];
      return fn(ctx, dispatch);
    };

    return dispatch();
  }
}

/** Module-level default pipeline — attach middleware here via pipeline.use(). */
export const pipeline = new MiddlewarePipeline();
