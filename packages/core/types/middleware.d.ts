export interface MiddlewareContext {
  request: Request;
  params: Record<string, string>;
  /** Arbitrary values threaded through the middleware chain into loaders. */
  context: Record<string, unknown>;
}

export type MiddlewareFn = (ctx: MiddlewareContext, next: () => Promise<Response>) => Promise<Response>;

export declare class MiddlewarePipeline {
  use(fn: MiddlewareFn): this;
  run(ctx: MiddlewareContext, handler: () => Promise<Response>): Promise<Response>;
}

/** Module-level singleton pipeline — register app-wide middleware here. */
export declare const pipeline: MiddlewarePipeline;
