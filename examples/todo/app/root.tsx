import {
  isRouteErrorResponse,
  Link,
  LiveReload,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  Toaster,
} from "@bractjs/bractjs";
import { ArrowLeft, CircleAlert, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

// Side-effect import: registers the typed `/api/stats` route. root.tsx is the
// one module guaranteed to load in dev, prod, and the compiled binary, so this
// is the reliable place to register API routes (app/server.ts doesn't run in dev).
import "./api/stats.ts";
// App-wide styles (Tailwind). BractJS extracts and links it — no <style> tag.
import "./styles.css";
import { panel } from "./ui.tsx";

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

// The document shell (React Router's root `Layout`). It wraps the app below
// normally, and root's ErrorBoundary when the root loader fails — so even that
// page keeps the app's <html>, styles and header.
export function Layout({ children }: { children?: ReactNode }) {
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
        <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">{children}</div>
        <Toaster position="top-right" />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}

// Renders in the route's place for errors no route handles — like a URL that
// matches no route at all (a 404 inside the app's own chrome).
export function ErrorBoundary({ error }: { error: unknown }) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <main className={`${panel} grid justify-items-start gap-3 p-6`}>
      <span className="grid size-11 place-items-center rounded-md bg-marigold text-[#17262b]">
        <CircleAlert aria-hidden size={22} strokeWidth={2.25} />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">
        {status === 404 ? "Page not found" : "Something went wrong"}
      </h1>
      <p className="text-muted">
        {status === 404 ? "There's nothing at this address." : "Please try again in a moment."}
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} strokeWidth={2.5} />
        Back to the board
      </Link>
    </main>
  );
}
