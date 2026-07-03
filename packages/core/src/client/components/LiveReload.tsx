import type { ReactElement } from "react";
import { hmrClientScript } from "../../dev/hmr-client.ts";
import { isDevRuntime } from "../../server/env.ts";

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
export function LiveReload(): ReactElement | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!isDevRuntime()) return null;

  // SECURITY(low): dangerouslySetInnerHTML is safe here — hmrClientScript is a
  // build-time constant string with no user input. The NODE_ENV gate above
  // ensures this is never rendered in production. If hmrClientScript ever
  // accepts dynamic content, audit for XSS.
  // eslint-disable-next-line react/no-danger -- build-time constant HMR script, dev-only (see SECURITY note above)
  return <script dangerouslySetInnerHTML={{ __html: hmrClientScript }} />;
}
