import { LiveReload, Outlet, Scripts, ScrollRestoration, Toaster, useLocation } from "@bractjs/bractjs";
import { AdminShell } from "./ui.tsx";

// Side-effect imports: register the typed `/api/*` endpoints. root.tsx is the
// one module guaranteed to load in dev, prod, and the compiled binary, so it's
// the reliable place to register API routes (app/server.ts doesn't run in dev).
import "./api/posts.ts"; // public JSON feed
import "./api/auth.ts"; // Google / Microsoft OAuth start + callback
import "./api/media.ts"; // multipart upload endpoint for the drag/drop dropzone

export function meta() {
  return [
    { title: "BractJS CMS" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
}

// Sign-in screens render their own full-page AuthShell, so they're excluded
// from the admin chrome.
const NO_CHROME = new Set(["/admin/login", "/admin/verify", "/admin/logout"]);

export default function Root() {
  // bractjs SSR mounts root → leaf route (intermediate layout COMPONENTS aren't
  // rendered), so the admin chrome lives here, wrapping the Outlet for /admin/*.
  // The admin/layout.tsx loader still runs for gating + supplies the user via
  // useMatches() (read inside AdminShell).
  const { pathname } = useLocation();
  const adminChrome = pathname.startsWith("/admin") && !NO_CHROME.has(pathname);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/x-icon" href="/public/favicon.ico" />
        {/* Tailwind v4 output, compiled from app/styles.css by the `css` script. */}
        <link rel="stylesheet" href="/public/styles.css" />
      </head>
      <body>
        {adminChrome ? <AdminShell><Outlet /></AdminShell> : <Outlet />}
        <Toaster position="top-right" />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
