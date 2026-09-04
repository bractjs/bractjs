import { type ReactElement } from "react";
/**
 * Renders an inline WebSocket HMR client in development.
 * Returns null in production.
 *
 * Two gates:
 *  1. Build-time `process.env.NODE_ENV === "production"` — strips the script from
 *     the client bundle entirely (Bun substitutes this define at build time).
 *  2. Runtime `isDevRuntime()` — kills SSR injection unless the server was
 *     actually started via `bractjs dev`. Prevents `NODE_ENV=development
 *     bractjs start` from shipping an HMR client that retries WS forever.
 */
export declare function LiveReload(): ReactElement | null;
