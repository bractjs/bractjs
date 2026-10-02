/** Record a request's platform context (adapters). Not part of the public API. */
export declare function setPlatform(request: Request, platform: unknown): void;
/**
 * The current request's platform context — `{ env, ctx }` on Cloudflare
 * Workers — or undefined on runtimes that have none (Bun, Node, Deno):
 *
 * ```ts
 * const { env } = getPlatform<{ env: { DB: D1Database } }>()!;
 * ```
 */
export declare function getPlatform<T = unknown>(request?: Request): T | undefined;
