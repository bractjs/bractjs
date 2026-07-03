// app/routes/about.tsx → "/about"
//
// A static route. Because match priority is static > dynamic, "/about" wins
// over the "/:id" dynamic route. No loader needed — it's a plain page.

import { Link } from "@bractjs/bractjs";
import { card } from "../ui.tsx";

export function meta() {
  return [
    { title: "About | BractJS Todo" },
    { name: "description", content: "What this BractJS example demonstrates." },
  ];
}

// A route can export `headers` to set response headers on its document and
// `/_data` responses. This page is static, so we let it be cached. headers()
// runs in chain order (root → layout → route); spread `parentHeaders` to inherit
// what ancestors set, then override per key. (Skipped for mutations/errors.)
export function headers(): HeadersInit {
  return { "Cache-Control": "public, max-age=3600" };
}

const FEATURES: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "File-based routing",
    body: (
      <>
        <code>_index.tsx</code> → <code>/</code>, <code>[id].tsx</code> → <code>/:id</code>, and{" "}
        <code>about.tsx</code> → <code>/about</code>. Static routes outrank dynamic ones.
      </>
    ),
  },
  {
    title: "Loaders & actions",
    body: (
      <>
        Each route's <code>loader</code> runs on GET; <code>action</code> handles POST and re-runs the loader.{" "}
        <code>&lt;Form&gt;</code> wires the two together without a client fetch.
      </>
    ),
  },
  {
    title: "Server-only data",
    body: (
      <>
        The <code>bun:sqlite</code> store lives in <code>todos.server.ts</code>. The <code>.server.ts</code>{" "}
        suffix makes importing it from client code a hard build error.
      </>
    ),
  },
  {
    title: "Validation",
    body: (
      <>
        The add/rename forms run through BractJS's <code>validate()</code> helper, which accepts any{" "}
        <code>.safeParse()</code> schema (here a tiny dependency-free one; swap in Zod for real apps).
      </>
    ),
  },
  {
    title: "404 via HttpError",
    body: (
      <>
        Visiting <code>/does-not-exist</code> hits <code>[id].tsx</code>, whose loader throws{" "}
        <code>HttpError(404)</code> — rendered by its <code>ErrorBoundary</code>.
      </>
    ),
  },
  {
    title: "Typed API routes",
    body: (
      <>
        <code>app/api/stats.ts</code> registers <code>GET /api/stats</code> with <code>route()</code> — a
        typed JSON endpoint. Try <code>curl localhost:3000/api/stats</code>. Mutating routes are
        CSRF-protected by default, just like <code>&lt;Form&gt;</code>.
      </>
    ),
  },
  {
    title: "Response headers",
    body: (
      <>
        This page exports <code>headers()</code> to send <code>Cache-Control: public, max-age=3600</code> —
        per-route control over caching, ETags, and CDN hints.
      </>
    ),
  },
  {
    title: "Single-binary deploy",
    body: (
      <>
        <code>bun run compile</code> produces <code>./bin/todo-app</code>, a self-contained executable via{" "}
        <code>bun build --compile</code>.
      </>
    ),
  },
];

export default function About() {
  return (
    <main style={{ display: "grid", gap: "1rem" }}>
      <p style={{ margin: 0 }}>
        <Link
          to="/"
          prefetch="hover"
          style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
        >
          ← Back to the board
        </Link>
      </p>

      <section style={card}>
        <h1 style={{ margin: "0 0 .5rem", fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>About this demo</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          A small tour of the BractJS features this todo app exercises.
        </p>
      </section>

      <section style={{ ...card, display: "grid", gap: ".9rem" }}>
        {FEATURES.map((f) => (
          <div key={f.title}>
            <h2 style={{ margin: "0 0 .25rem", fontSize: "1.05rem" }}>{f.title}</h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
