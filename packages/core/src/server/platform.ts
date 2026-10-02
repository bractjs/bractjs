import { getRequest } from "./request-context.ts";

// What the hosting platform hands each request beyond the Request itself —
// on Cloudflare Workers, the `env` bindings (KV, D1, R2, secrets) and the
// execution `ctx` (waitUntil). Adapters record it per request; app code reads
// it with getPlatform() anywhere in the request (loaders, actions, API
// handlers, server actions, middleware).
const platforms = new WeakMap<Request, unknown>();

/** Record a request's platform context (adapters). Not part of the public API. */
export function setPlatform(request: Request, platform: unknown): void {
  platforms.set(request, platform);
}

/**
 * The current request's platform context — `{ env, ctx }` on Cloudflare
 * Workers — or undefined on runtimes that have none (Bun, Node, Deno):
 *
 * ```ts
 * const { env } = getPlatform<{ env: { DB: D1Database } }>()!;
 * ```
 */
export function getPlatform<T = unknown>(request: Request = getRequest()): T | undefined {
  return platforms.get(request) as T | undefined;
}
