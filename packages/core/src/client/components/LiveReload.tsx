import { type ReactElement, useContext } from "react";
import { hmrClientScript } from "../../dev/hmr-client.ts";
import { isDevRuntime } from "../../server/env.ts";
import { CspNonceContext } from "../../shared/nonce-context.tsx";

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
  // Read the context unconditionally (hook rules) — it's undefined on the
  // client and when the csp() middleware didn't run.
  const nonce = useContext(CspNonceContext);

  if (process.env.NODE_ENV === "production") return null;
  if (!isDevRuntime()) return null;

  // SECURITY(low): dangerouslySetInnerHTML is safe here — hmrClientScript is a
  // build-time constant string with no user input. The NODE_ENV gate above
  // ensures this is never rendered in production. If hmrClientScript ever
  // accepts dynamic content, audit for XSS.
  //
  // The nonce keeps this inline script (and, via 'strict-dynamic', the route
  // chunks + devtools module it dynamically imports) executable under the
  // csp() middleware's policy. Browsers hide the attribute post-parse, so the
  // client-side render (nonce=undefined) never mismatches against the DOM.
  // eslint-disable-next-line react/no-danger -- build-time constant HMR script, dev-only (see SECURITY note above)
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: hmrClientScript }} />;
}
