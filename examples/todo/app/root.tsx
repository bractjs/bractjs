import { Link, LiveReload, NavLink, Outlet, Scripts, ScrollRestoration, Toaster } from "@bractjs/bractjs";
import { ListChecks } from "lucide-react";

// Side-effect import: registers the typed `/api/stats` route. root.tsx is the
// one module guaranteed to load in dev, prod, and the compiled binary, so this
// is the reliable place to register API routes (app/server.ts doesn't run in dev).
import "./api/stats.ts";
// App-wide styles (Tailwind). BractJS extracts and links it — no <style> tag.
import "./styles.css";

// Site-wide default <title> / <meta>. Each route's meta() overrides these
// (React 19 hoists route <title>/<meta> into <head>).
export function meta() {
  return [{ title: "BractJS Todo" }, { name: "viewport", content: "width=device-width, initial-scale=1" }];
}

// NavLink marks the link for the current page (aria-current + these classes).
const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
    isActive ? "bg-teal-ink text-teal" : "text-teal-ink hover:bg-teal-ink/15"
  }`;

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/x-icon" href="/public/favicon.ico" />
      </head>
      <body>
        <header className="bg-teal text-teal-ink">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
            <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <ListChecks aria-hidden size={22} strokeWidth={2.5} />
              Bract Todo
            </Link>
            <nav aria-label="Primary" className="ml-auto flex gap-1">
              <NavLink to="/" className={navClass}>
                Board
              </NavLink>
              <NavLink to="/about" className={navClass}>
                About
              </NavLink>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
          <Outlet />
        </div>
        <Toaster position="top-right" />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
