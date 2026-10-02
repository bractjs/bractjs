// app/routes/about.tsx → "/about"
//
// A static route. Because match priority is static > dynamic, "/about" wins
// over the "/:id" dynamic route. No loader needed — it's a plain page.

import {
  type ClientLoaderFunctionArgs,
  type ClientMiddlewareFunction,
  createContext,
  Link,
  useLoaderData,
} from "@bractjs/bractjs";
import {
  ArrowLeft,
  Braces,
  Clock,
  Database,
  FolderTree,
  type LucideIcon,
  Package,
  Palette,
  Repeat,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import { panel } from "../ui.tsx";

// Route-scoped CSS Module: only this route imports it, so the build extracts it
// into THIS route's CSS bundle ("/" never downloads it), and the server renders
// the same scoped class names as the browser.
import styles from "./about.module.css";

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

const FEATURES: Array<{ icon: LucideIcon; title: string; body: React.ReactNode }> = [
  {
    icon: FolderTree,
    title: "File-based routing",
    body: (
      <>
        <code>_index.tsx</code> → <code>/</code>, <code>[id].tsx</code> → <code>/:id</code>, and{" "}
        <code>about.tsx</code> → <code>/about</code>. Static routes outrank dynamic ones.
      </>
    ),
  },
  {
    icon: Repeat,
    title: "Loaders & actions",
    body: (
      <>
        Each route's <code>loader</code> runs on GET; <code>action</code> handles POST and re-runs the loader.{" "}
        <code>&lt;Form&gt;</code> wires the two together without a client fetch.
      </>
    ),
  },
  {
    icon: Database,
    title: "Server-only data",
    body: (
      <>
        The <code>bun:sqlite</code> store lives in <code>todos.server.ts</code>. The <code>.server.ts</code>{" "}
        suffix keeps it on the server: client bundles get an inert stub instead of the module.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Validation",
    body: (
      <>
        The add and rename forms run through <code>safeValidate()</code>, which accepts any{" "}
        <code>.safeParse()</code> schema (here a tiny dependency-free one; swap in Zod for real apps) and
        returns the first error for the toast.
      </>
    ),
  },
  {
    icon: SearchX,
    title: "404 via HttpError",
    body: (
      <>
        Visiting <code>/does-not-exist</code> hits <code>[id].tsx</code>, whose loader throws{" "}
        <code>HttpError(404)</code> — rendered by its <code>ErrorBoundary</code>.
      </>
    ),
  },
  {
    icon: Braces,
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
    icon: Clock,
    title: "Response headers",
    body: (
      <>
        This page exports <code>headers()</code> to send <code>Cache-Control: public, max-age=3600</code> —
        per-route control over caching, ETags, and CDN hints.
      </>
    ),
  },
  {
    icon: Palette,
    title: "Styling",
    body: (
      <>
        <code>app/styles.css</code> is Tailwind v4 (<code>tailwind: true</code> in the config), and this page
        adds a CSS Module. BractJS extracts both to hashed files and links them during SSR, so nothing flashes
        unstyled.
      </>
    ),
  },
  {
    icon: Package,
    title: "Single-binary deploy",
    body: (
      <>
        <code>bun run compile</code> produces <code>./bin/todo-app</code>, a self-contained executable via{" "}
        <code>bun build --compile</code>.
      </>
    ),
  },
];

// Client middleware + client loader (React Router 8): when you navigate here
// in the browser, the middleware puts the navigation's start time on the
// shared context and the client loader reads it back. A full page load runs
// neither (no `clientLoader.hydrate`), so the note only appears after a click.
const navigationStart = createContext<number>(0);

export const clientMiddleware: ClientMiddlewareFunction[] = [
  async ({ context }, next) => {
    context.set(navigationStart, performance.now());
    await next();
  },
];

export async function clientLoader({ context }: ClientLoaderFunctionArgs) {
  return { loadedInMs: Math.round(performance.now() - context.get(navigationStart)) };
}

export default function About() {
  const clientData = useLoaderData<typeof clientLoader>();
  return (
    <main className="grid gap-6">
      <Link
        to="/"
        prefetch="hover"
        className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-teal hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} strokeWidth={2.5} />
        Board
      </Link>

      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">About this demo</h1>
        <p className="text-muted">The BractJS features this todo app uses, and where to find them.</p>
        {clientData?.loadedInMs !== undefined ? (
          <p className="text-sm text-muted" data-testid="client-loaded">
            Loaded in the browser in {clientData.loadedInMs} ms (clientMiddleware + clientLoader).
          </p>
        ) : null}
      </header>

      <ul className={`${panel} divide-y divide-line`}>
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className={`${styles.feature} flex gap-4 p-5`}>
            <span className={styles.icon}>
              <Icon aria-hidden size={18} strokeWidth={2.25} />
            </span>
            <div className="grid gap-1">
              <h2 className="font-bold">{title}</h2>
              <p className="leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
