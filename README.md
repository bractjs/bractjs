# BractJS

> Production-grade SSR framework for Bun + React.  
> File-based routing · Parallel loaders · Streaming SSR · Built-in HMR · Server Actions

---

## Quick Start

```sh
# Requires Bun — https://bun.sh
bunx bractjs new my-app
cd my-app
bun run dev
# → http://localhost:3000
```

> **From source (pre-publish):** clone the repo, then `bun run bin/cli.ts new my-app`.

---

## File-Based Routing

Place files inside `app/routes/`. BractJS scans them at startup.

| File | URL |
|------|-----|
| `routes/_index.tsx` | `/` |
| `routes/about.tsx` | `/about` |
| `routes/blog/_index.tsx` | `/blog` |
| `routes/blog/[id].tsx` | `/blog/:id` |
| `routes/docs/[...slug].tsx` | `/docs/*` (catch-all) |
| `routes/blog/layout.tsx` | wraps all `/blog/*` routes |

`app/root.tsx` is the outermost layout (always rendered). Match priority per segment: **static > dynamic > catch-all**.

---

## Route Module API

Every file in `app/routes/` can export any combination of these:

```tsx
import type { LoaderArgs, ActionArgs, MetaArgs } from "@bractjs/bractjs";
import { redirect } from "@bractjs/bractjs";

// Runs on every GET — return value becomes useLoaderData()
export async function loader({ request, params, context }: LoaderArgs) {
  const post = await db.post.findById(params.id);
  if (!post) throw new Response("Not Found", { status: 404 });
  return { post };
}

export type LoaderData = Awaited<ReturnType<typeof loader>>;

// Runs on POST / PUT / DELETE
export async function action({ params, formData }: ActionArgs) {
  await db.post.update(params.id, { title: formData.get("title") as string });
  return redirect("/blog");
}

// SSR <title> and <meta> tags
export function meta({ loaderData }: MetaArgs<LoaderData>) {
  return [
    { title: loaderData.post.title },
    { name: "description", content: loaderData.post.excerpt },
  ];
}

// Error boundary for this route segment
export function ErrorBoundary({ error }: { error: Error }) {
  return <p>Error: {error.message}</p>;
}

// The page component (required)
export default function BlogPost() {
  const { post } = useLoaderData<LoaderData>();
  return <article><h1>{post.title}</h1></article>;
}
```

---

## Root Layout (`app/root.tsx`)

Required. Provides the `<html>` document shell.

```tsx
import { Scripts, LiveReload, Outlet } from "@bractjs/bractjs";

export function meta() {
  return [{ title: "My App" }, { name: "viewport", content: "width=device-width, initial-scale=1" }];
}

export default function Root() {
  return (
    <html lang="en">
      <head>{/* BractJS injects <title> and <meta> tags here */}</head>
      <body>
        <Outlet />     {/* current route tree */}
        <Scripts />    {/* client bundle */}
        <LiveReload /> {/* dev-only HMR — no-op in production */}
      </body>
    </html>
  );
}
```

---

## Deferred / Streaming Data

`defer()` streams slow data without blocking the initial HTML response.

```tsx
import { defer } from "@bractjs/bractjs";
import { Await } from "@bractjs/bractjs";
import { Suspense } from "react";

export async function loader({ params }: LoaderArgs) {
  return defer({
    post: await db.post.findById(params.id),  // awaited — in initial HTML
    comments: db.comments.forPost(params.id), // Promise — streamed later
  });
}

export default function BlogPost() {
  const { post, comments } = useLoaderData<LoaderData>();
  return (
    <article>
      <h1>{post.title}</h1>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Await resolve={comments}>
          {(c) => <CommentList comments={c} />}
        </Await>
      </Suspense>
    </article>
  );
}
```

---

## Client Primitives

### `<Link>`

Soft-navigates without a full reload. `prefetch="hover"` preloads the route chunk + loader data on mouse-enter.

```tsx
import { Link } from "@bractjs/bractjs";

<Link to="/blog/42">Read Post</Link>
<Link to="/about" prefetch="hover">About</Link>
```

### `<Form>`

Fetch-based submission. Re-runs the current route's loader after the action completes.

```tsx
import { Form } from "@bractjs/bractjs";

<Form method="post" action="/blog/new">
  <input name="title" />
  <button type="submit">Create</button>
</Form>
```

### `<Outlet>`

Renders the matched child route inside a layout.

```tsx
export default function BlogLayout() {
  return (
    <div>
      <nav>Blog</nav>
      <Outlet />
    </div>
  );
}
```

---

## Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useLoaderData<T>()` | `T` | Loader return value for the current route |
| `useActionData<T>()` | `T \| null` | Most recent action return value |
| `useParams<T>()` | `T` | URL dynamic params (generic for typed params) |
| `useNavigation()` | `{ state }` | `"idle"` \| `"loading"` \| `"submitting"` |
| `useFetcher()` | `{ data, state, load, submit }` | Background fetch without navigation |

```tsx
import { useLoaderData, useNavigation, useFetcher } from "@bractjs/bractjs";

const { post } = useLoaderData<LoaderData>();

const { state } = useNavigation();
if (state === "loading") return <Spinner />;

const fetcher = useFetcher();
fetcher.load("/api/suggestions?q=bun");
```

---

## Image Optimization

`<Image>` serves responsively-sized, format-converted images through a built-in `/_image` endpoint. Requires [ImageMagick](https://imagemagick.org) (`magick` or `convert`) — falls back to serving the original if not installed.

```tsx
import { Image } from "@bractjs/bractjs";

// Basic — lazy, WebP, 80% quality, responsive srcset
<Image src="/public/hero.jpg" alt="Hero" width={1200} height={600} />

// Above-the-fold — eager load + fetchpriority=high
<Image src="/public/hero.jpg" alt="Hero" width={1200} priority />

// Custom format / quality / fit
<Image
  src="/public/photo.jpg"
  alt="Photo"
  width={800}
  format="avif"
  quality={70}
  fit="contain"
  sizes="(max-width: 640px) 100vw, 50vw"
/>
```

The component generates a `srcset` across up to 7 breakpoints (320 → 1920 px). Optimized images are cached in memory (LRU, 200 slots) and on disk (`.bract-image-cache/`, survives restarts). Both layers respond with `Cache-Control: immutable`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | — | Path under `/public/` |
| `alt` | `string` | — | Alt text (required) |
| `width` | `number` | — | Intrinsic width |
| `height` | `number` | — | Intrinsic height |
| `quality` | `number` | `80` | 1–100 |
| `format` | `"webp" \| "avif" \| "jpeg" \| "png"` | `"webp"` | Output format |
| `fit` | `"cover" \| "contain" \| "fill"` | `"cover"` | Resize mode |
| `priority` | `boolean` | `false` | Disable lazy loading, set `fetchpriority=high` |
| `sizes` | `string` | `"100vw"` | HTML `sizes` attribute |

---

## Typed Routes (Codegen)

Run `bractjs codegen` to generate `app/route-types.gen.ts` from your route files. This runs automatically during `bractjs build`.

```sh
bractjs codegen            # reads ./app, writes ./app/route-types.gen.ts
bractjs codegen ./app ./app/route-types.gen.ts  # explicit paths
```

**Generated file provides:**

```ts
// Every URL pattern as a string literal union
export type AppRoutes = "/" | "/blog/:id" | "/org/:orgId/repo/:repoId";

// Per-route typed params
export type RouteParams<T extends AppRoutes> =
  T extends "/blog/:id" ? { id: string } :
  T extends "/org/:orgId/repo/:repoId" ? { orgId: string; repoId: string } :
  Record<never, never>;

// Typed loader / action args
export type TypedLoaderArgs<T extends AppRoutes> = { request: Request; params: RouteParams<T>; context: Record<string, unknown> };
export type TypedActionArgs<T extends AppRoutes> = TypedLoaderArgs<T> & { formData: FormData };

// Type-safe route builder
export const routes = {
  "/": () => "/",
  "/blog/:id": (params: { id: string }) => `/blog/${params.id}`,
} as const;
```

**Usage:**

```ts
// Typed loader — params.id is string, not string | undefined
import type { TypedLoaderArgs, RouteParams } from "../route-types.gen.ts";

export async function loader({ params }: TypedLoaderArgs<"/blog/:id">) {
  return db.post.findById(params.id); // ✓ typed
}

// Typed params hook
const { id } = useParams<RouteParams<"/blog/:id">>();

// Type-safe navigation
import { routes } from "../route-types.gen.ts";
routes["/blog/:id"]({ id: "123" });         // → "/blog/123"
routes["/does-not-exist"]();                 // ✗ TypeScript error
```

---

## Server Actions & Client Components

### `"use server"` — Server Actions

Add `"use server"` as the first line of a file to mark its exports as Server Actions. On the client, calls are automatically serialized to `POST /_action?id=<hash>`. On the server, the real function runs.

```ts
// app/actions.ts
"use server";

export async function createPost(formData: FormData) {
  const title = formData.get("title") as string;
  await db.insert(posts).values({ title });
  return { ok: true };
}

export async function deletePost(id: string) {
  await db.delete(posts).where(eq(posts.id, id));
}
```

```tsx
// app/routes/new.tsx — import used normally; on client it becomes a fetch proxy
import { createPost } from "../actions.ts";

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" />
      <button type="submit">Create</button>
    </form>
  );
}
```

Server actions accept `FormData` (sent as `multipart/form-data`) or JSON-serializable argument arrays. Unknown action IDs return 404 — there is no way to call a function that was not registered at startup.

### `"use client"` — Client-Only Components

Add `"use client"` to mark a component as browser-only. During server builds the module is stubbed to `null` to prevent browser API (`window`, `document`, `localStorage`) crashes.

```tsx
// app/components/Counter.tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>Count: {n}</button>;
}
```

---

## Middleware

Middleware runs before routing. Register on the module-level `pipeline` singleton.

```ts
import { pipeline, requestLogger, cors, authGuard } from "@bractjs/bractjs";

pipeline
  .use(requestLogger())
  .use(cors({ origin: "https://myapp.com" }))
  .use(authGuard({ session }));
```

| Middleware | Description |
|---|---|
| `requestLogger()` | Logs method, path, status, duration |
| `cors(options)` | Sets CORS headers, handles `OPTIONS` preflight |
| `authGuard(options)` | Reads session, attaches `context.user`, returns 401 if unauthenticated |

**Custom middleware:**

```ts
import type { MiddlewareFn } from "@bractjs/bractjs";

const trace: MiddlewareFn = async (ctx, next) => {
  ctx.context.requestId = crypto.randomUUID();
  return next();
};
```

`ctx.context` is threaded into every `loader` and `action` as the `context` argument.

---

## Sessions

```ts
import { createCookieSession } from "@bractjs/bractjs";

const session = createCookieSession({
  name: "__session",
  secrets: [Bun.env.SESSION_SECRET],  // rotate: prepend new secret, keep old ones
  maxAge: 60 * 60 * 24 * 7,           // 1 week
  secure: true,
  sameSite: "lax",
});

export async function loader({ request }: LoaderArgs) {
  const s = await session.getSession(request.headers.get("Cookie"));
  return { user: s.get("user") };
}

export async function action({ request }: ActionArgs) {
  const s = await session.getSession(request.headers.get("Cookie"));
  s.set("user", { id: 1, name: "Alice" });
  return redirect("/dashboard", {
    headers: { "Set-Cookie": await session.commitSession(s) },
  });
}
```

Cookies are signed with HMAC-SHA256 using `crypto.subtle`. Tampered cookies are silently rejected and return an empty session.

> Generate a secret: `openssl rand -base64 32`

---

## Environment Variables

| Convention | Behavior |
|---|---|
| `*.server.ts` / `*.server.tsx` | Import blocked in client bundles at build time — hard error |
| Keys in `clientEnv` | Replaced with string literals in client bundle |
| All other `process.env.*` | Become `"undefined"` in client bundles |

```ts
// db.server.ts — never reaches the browser
export const db = new Database(Bun.env.DATABASE_URL);
```

---

## Server Lifecycle Hooks

Use `defineLifecycle()` in `app/lifecycle.ts` to run code when the server starts or shuts down. The shutdown hook runs on **any** exit signal (`SIGTERM`, `SIGINT`, `SIGUSR2`, `beforeExit`, and uncaught exceptions), so database connections are always closed cleanly.

```ts
// app/lifecycle.ts
import { defineLifecycle } from "@bractjs/bractjs";
import { db } from "./db.server.ts";

export default defineLifecycle({
  async onStart() {
    await db.connect();
    console.log("Database connected");
  },
  async onShutdown() {
    await db.disconnect();
    console.log("Database disconnected");
  },
});
```

BractJS picks up `app/lifecycle.ts` automatically in dev mode. In production, spread the hooks into `createServer()`:

```ts
// server.ts (production entry)
import { createServer } from "@bractjs/bractjs";
import lifecycle from "./app/lifecycle.ts";

createServer({ port: 3000, ...lifecycle });
```

| Hook | When it runs |
|------|-------------|
| `onStart` | Once, after the server begins accepting requests |
| `onShutdown` | Before process exit — any signal or uncaught exception |

---

## Configuration Reference

All fields are optional. BractJS works with zero configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `3000` | TCP port |
| `appDir` | `string` | `"./app"` | Directory containing `routes/` and `root.tsx` |
| `publicDir` | `string` | `"./public"` | Static assets (served with no-cache) |
| `buildDir` | `string` | `"./build"` | Output for `bractjs build` |
| `imageCacheDir` | `string` | `".bract-image-cache"` | Disk cache for optimized images |
| `sourcemap` | `string` | `"external"` | `"none"` \| `"inline"` \| `"external"` |
| `minify` | `boolean` | `true` | Minify client bundles |
| `clientEnv` | `string[]` | `[]` | `process.env` keys exposed to the client |
| `onStart` | `() => void \| Promise<void>` | — | Called once after the server starts listening |
| `onShutdown` | `() => void \| Promise<void>` | — | Called before process exit on any signal |

---

## CLI

| Command | Description |
|---------|-------------|
| `bractjs new <name>` | Scaffold a new app into `<name>/` |
| `bractjs dev` | Start dev server with HMR on port 3000 |
| `bractjs build` | Dual server + client build with content-hashed output |
| `bractjs start` | Serve the production build |
| `bractjs codegen [app] [out]` | Generate typed route types into `app/route-types.gen.ts` |

The CLI is a thin convenience layer. Every command delegates to a public programmatic API — you can call the same functions directly from your own scripts without the CLI.

---

## Programmatic API

All three runtime operations are importable, so BractJS can be embedded in existing servers or custom build scripts without the CLI.

### `createDevServer(options?)`

```ts
import { createDevServer } from "@bractjs/bractjs";

const dev = await createDevServer({
  port: 3000,    // HTTP port (default: config.port ?? 3000)
  hmrPort: 3001, // HMR WebSocket port (default: 3001)
  config: { appDir: "./app", clientEnv: ["PUBLIC_API_URL"] },
  skipUserConfig: false, // set true to skip loading bractjs.config.ts from cwd
});

// Later — stops the HTTP server and HMR WebSocket server
dev.stop();
```

### `runBuild(config?)`

```ts
import { runBuild } from "@bractjs/bractjs";

await runBuild({
  appDir: "./app",
  buildDir: "./dist",
  minify: true,
  sourcemap: "external",
  clientEnv: ["PUBLIC_API_URL"],
});
```

`runBuild` only accepts build-relevant fields (`appDir`, `buildDir`, `sourcemap`, `minify`, `clientEnv`, `plugins`). Server-only fields like `port`, `manifest`, and `publicDir` are not accepted — this makes it safe to call from a build script without constructing a full server config.

### `loadUserConfig()`

```ts
import { loadUserConfig } from "@bractjs/bractjs";

const cfg = await loadUserConfig();
// Reads bractjs.config.ts (or .js) from process.cwd()
// Returns {} if no config file exists
```

### `createServer(config?)` (production)

Already exported. Starts the production HTTP server directly:

```ts
import { createServer } from "@bractjs/bractjs";
import lifecycle from "./app/lifecycle.ts";

createServer({ port: 3000, buildDir: "./build", ...lifecycle });
```

---

## App Directory Structure

```
my-app/
├── app/
│   ├── root.tsx              # required — <html> shell
│   ├── lifecycle.ts          # optional — onStart / onShutdown hooks
│   ├── route-types.gen.ts    # generated by bractjs codegen
│   ├── actions.ts            # "use server" actions
│   └── routes/
│       ├── _index.tsx        # → /
│       ├── about.tsx         # → /about
│       ├── blog/
│       │   ├── layout.tsx    # layout for /blog/*
│       │   ├── _index.tsx    # → /blog
│       │   └── [id].tsx      # → /blog/:id
│       └── docs/
│           └── [...slug].tsx # → /docs/*
├── public/
│   └── favicon.ico
└── build/                    # generated — do not edit
    ├── server/
    ├── client/
    └── route-manifest.json
```

---

## Architecture

```
Request
  └─ Middleware pipeline
       └─ /_action  → Server Action registry → fn(...args)
       └─ /_image   → ImageMagick transform → LRU cache → Response
       └─ Route trie (static > param > catch-all)
            └─ Layout chain (root → layout → route)
                 └─ Parallel loaders (Promise.all)
                      └─ renderToReadableStream → streaming Response
```

Client:
```
hydrateRoot(document)
  └─ ClientRouter (RouterContext + NavigationContext)
       └─ Outlet → React.lazy route chunk
            └─ useLoaderData / useParams / useNavigation / …
```

Build pipeline (`bractjs build`):
```
1. codegen        → app/route-types.gen.ts
2. server bundle  → Bun.build (target: bun)   + useClientStubPlugin
3. client bundle  → Bun.build (target: browser, splitting) + useServerProxyPlugin
4. content-hash   → rename outputs, write route-manifest.json
```

---

## Package Structure

```
bractjs/
├── src/
│   ├── server/      # SSR, routing, loaders, actions, sessions, action-registry
│   ├── client/      # hydrateRoot, contexts, hooks, Link/Form/Image components
│   ├── build/       # Bun.build orchestration, manifest, hashing, directives
│   ├── codegen/     # route-types.gen.ts generator
│   ├── image/       # /_image handler, ImageMagick optimizer, LRU cache
│   ├── dev/         # watcher, HMR server + client, error overlay
│   ├── shared/      # types, errors, deferred, context
│   └── middleware/  # requestLogger, cors, authGuard
├── bin/cli.ts
├── types/           # TypeScript declaration files
└── templates/
    └── new-app/     # scaffold template
```

---

## Why BractJS

- **Bun-native** — `Bun.serve`, `Bun.build`, `Bun.file`, `Bun.Glob`, `Bun.watch`. No Node.js.
- **Zero framework deps** — only peer dependencies are `react` and `react-dom`.
- **Streaming SSR** — `renderToReadableStream()` with `defer()` for slow data.
- **File-based routing** — drop a file in `app/routes/`, it's a route.
- **Full-stack** — loaders, actions, sessions, server actions, and middleware in one package.
- **Typed routes** — codegen produces per-route param types and a type-safe route builder.

---

## Status

**v0.1.21.** All core phases shipped:

- File-based routing with trie matcher and layout chains
- Streaming SSR (`renderToReadableStream`) with `defer()` and `<Await>`
- Client hydration, soft navigation, `popstate`, prefetch
- HMR with module-level swap (no full reload)
- Cookie sessions with HMAC-SHA256 and secret rotation
- Middleware pipeline with `requestLogger`, `cors`, `authGuard`
- Production build with content-hashed assets and code splitting
- `<Image>` with on-demand ImageMagick optimization and LRU cache
- Typed routes codegen (`AppRoutes`, `RouteParams<T>`, `TypedLoaderArgs<T>`, `routes` builder)
- `"use server"` / `"use client"` directive system with `/_action` endpoint
- **Programmatic API** — `createDevServer`, `runBuild`, `loadUserConfig` importable without the CLI

Remaining on the roadmap: Edge runtime (Cloudflare Workers), CSS modules, i18n routing, streaming `useFetcher()`.

---

## License

MIT
