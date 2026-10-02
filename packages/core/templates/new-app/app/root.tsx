// The root layout: every route renders inside <Outlet />.
import { LiveReload, Outlet, Scripts, ScrollRestoration } from "@bractjs/bractjs";
import "./styles.css";

// The default <title> and <meta>; a route's meta() adds to or overrides these.
export function meta() {
  return [{ title: "{{APP_NAME}}" }, { name: "viewport", content: "width=device-width, initial-scale=1" }];
}

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
