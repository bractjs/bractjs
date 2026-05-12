import { type ReactElement } from "react";
import { hmrClientScript } from "../../dev/hmr-client.ts";

/**
 * Renders an inline WebSocket HMR client in development.
 * Returns null in production.
 */
export function LiveReload(): ReactElement | null {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: hmrClientScript }}
    />
  );
}
