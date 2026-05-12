// This is a user file, not framework source.
// It lives in the app/ directory of a BractJS project and represents
// the root layout that wraps every page.
import { Scripts, LiveReload, Outlet } from "bractjs";

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Bract App</title>
      </head>
      <body>
        <Outlet />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
