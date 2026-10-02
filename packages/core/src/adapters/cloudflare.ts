/**
 * Cloudflare Workers adapter for BractJS.
 *
 * Usage in your worker entrypoint:
 *   import { buildFetchHandler, makeCloudflareHandler } from "@bractjs/bractjs";
 *
 *   const handler = buildFetchHandler({ appDir: './app', ... });
 *   export default makeCloudflareHandler(handler);
 *
 * The Worker's `env` bindings and `ctx` reach app code through
 * `getPlatform<{ env; ctx }>()` (loaders, actions, API handlers, middleware).
 *
 * Build with:
 *   bun build --target=browser --outfile=dist/worker.js src/worker.ts
 */

import type { BractAdapter } from "../server/adapter.ts";
import { setPlatform } from "../server/platform.ts";

// Cloudflare Workers ExportedHandler shape (subset we need).
interface CloudflareEnv {
  [key: string]: unknown;
}

interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface CloudflareExportedHandler {
  fetch(request: Request, env: CloudflareEnv, ctx: CloudflareExecutionContext): Promise<Response>;
}

/**
 * Wraps a BractJS fetch handler in the Cloudflare Workers `{ fetch }` export pattern.
 *
 * The adapter implements BractAdapter so it can also be passed to createServer()
 * in a dual-mode setup (dev = Bun, prod = CF).
 */
export function createCloudflareAdapter(
  handler: (request: Request) => Promise<Response>,
): CloudflareExportedHandler & BractAdapter {
  return {
    // Works both as a BractAdapter (fetch(request)) and as the Workers export
    // (fetch(request, env, ctx)); env/ctx reach app code via getPlatform().
    fetch(request: Request, env?: CloudflareEnv, ctx?: CloudflareExecutionContext) {
      if (env !== undefined || ctx !== undefined) setPlatform(request, { env, ctx });
      return handler(request);
    },
  };
}

/**
 * Convenience: export a Cloudflare Workers handler from your app config.
 *
 * Usage in src/worker.ts:
 *   export default cloudflareHandler;
 */
export function makeCloudflareHandler(handler: (request: Request) => Promise<Response>): {
  fetch(request: Request, env: CloudflareEnv, ctx: CloudflareExecutionContext): Promise<Response>;
} {
  return {
    fetch(request, env, ctx) {
      setPlatform(request, { env, ctx });
      return handler(request);
    },
  };
}
