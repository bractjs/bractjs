import { type ReactElement } from "react";
import { hmrClientScript } from "../../dev/hmr-client.ts";

/**
 * Renders an inline WebSocket HMR client in development.
 * Returns null in production.
 */
export function LiveReload(): ReactElement | null {
  if (process.env.NODE_ENV === "production") return null;

  // SECURITY(low): dangerouslySetInnerHTML is safe here — hmrClientScript is a
  // build-time constant string with no user input. The NODE_ENV gate above
  // ensures this is never rendered in production. If hmrClientScript ever
  // accepts dynamic content, audit for XSS.
  return (
    <script
      dangerouslySetInnerHTML={{ __html: hmrClientScript }}
    />
  );
}
