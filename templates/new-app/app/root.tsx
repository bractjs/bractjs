// This is the root layout for your BractJS app.
// Every route renders inside this component.
import { Scripts, LiveReload, Outlet } from "bractjs";

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{{APP_NAME}}</title>
      </head>
      <body>
        <Outlet />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
