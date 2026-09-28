import { Link, Outlet, Scripts } from "@bractjs/bractjs";

export function meta() {
  return [{ title: "Bench" }, { name: "viewport", content: "width=device-width, initial-scale=1" }];
}

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Products</Link> <Link to="/about">About</Link>
          </nav>
        </header>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
