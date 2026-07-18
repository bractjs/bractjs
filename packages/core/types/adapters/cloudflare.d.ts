/**
 * Cloudflare Workers adapter for BractJS.
 *
 * Usage in your worker entrypoint:
 *   import { createCloudflareAdapter } from 'bractjs/adapters/cloudflare';
 *   import { buildFetchHandler } from 'bractjs';
 *
 *   const handler = buildFetchHandler({ appDir: './app', ... });
 *   export default createCloudflareAdapter(handler);
 *
 * Build with:
 *   bun build --target=browser --outfile=dist/worker.js src/worker.ts
 */
import type { BractAdapter } from "../server/adapter.ts";
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
export declare function createCloudflareAdapter(handler: (request: Request) => Promise<Response>): CloudflareExportedHandler & BractAdapter;
/**
 * Convenience: export a Cloudflare Workers handler from your app config.
 *
 * Usage in src/worker.ts:
 *   export default cloudflareHandler;
 */
export declare function makeCloudflareHandler(handler: (request: Request) => Promise<Response>): {
    fetch(request: Request, env: CloudflareEnv, ctx: CloudflareExecutionContext): Promise<Response>;
};
export {};
