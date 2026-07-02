import { Link, LiveReload, Outlet, Scripts, ScrollRestoration, Toaster } from "@bractjs/bractjs";

// Side-effect import: registers the typed `/api/stats` route. root.tsx is the
// one module guaranteed to load in dev, prod, and the compiled binary, so this
// is the reliable place to register API routes (app/server.ts doesn't run in dev).
import "./api/stats.ts";

const styles = `
  :root {
    --bg: #f4f1e8;
    --paper: #fffdf7;
    --ink: #132024;
    --muted: #5b6b70;
    --accent: #0f8b8d;
    --accent-2: #f4a261;
    --danger: #b53f3f;
    --line: #d5dfdd;
    --radius: 14px;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    font-family: "Avenir Next", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at 15% 15%, #ffffff 0%, transparent 30%),
      radial-gradient(circle at 85% 0%, #ffe8c9 0%, transparent 38%),
      linear-gradient(160deg, #f1eee4 0%, #e9f2ef 100%);
  }

  a { color: inherit; }

  .page {
    width: min(980px, calc(100vw - 2rem));
    margin: 2.5rem auto;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .topbar a { text-decoration: none; }

  .brand {
    font-weight: 800;
    letter-spacing: -0.02em;
    font-size: 1.05rem;
  }

  .brand .dot { color: var(--accent); }

  .nav { margin-left: auto; display: inline-flex; gap: .35rem; }

  .nav a {
    color: var(--muted);
    font-weight: 600;
    font-size: .9rem;
    padding: .35rem .7rem;
    border-radius: 999px;
    border: 1px solid transparent;
  }

  .nav a:hover { border-color: var(--line); background: #fff; }

  @media (max-width: 640px) {
    .page {
      width: calc(100vw - 1.25rem);
      margin: 1rem auto;
    }
  }
`;

// Site-wide default <title> / <meta>. Each route's meta() overrides these
// (React 19 hoists route <title>/<meta> into <head>).
export function meta() {
  return [
    { title: "BractJS Todo" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
}

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/x-icon" href="/public/favicon.ico" />
        <style>{styles}</style>
      </head>
      <body>
        <div className="page">
          <header className="topbar">
            <Link to="/" className="brand">
              Bract<span className="dot">·</span>Todo
            </Link>
            <nav className="nav" aria-label="Primary">
              <Link to="/">Board</Link>
              <Link to="/about">About</Link>
            </nav>
          </header>
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
