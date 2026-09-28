# Migrating from Remix / React Router 7

If you know Remix v2 or React Router 7 framework mode, most of BractJS will feel familiar: routes are files, data comes from `loader`, mutations go through `action` and `<Form>`, and hooks like `useLoaderData` and `useFetcher` do what you expect. This guide covers what _changes_. It's organized in the order you'll hit things while porting, and ends with a checklist and the gaps that have no equivalent yet.

Read [Concepts](concepts.md) alongside this. The biggest behavioral differences — three run modes and the middleware scoping rules — are explained there.

## Before you start: platform differences

| Remix / RR7                              | BractJS                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Node, Bun, Deno, Workers via adapters    | **Bun only** (≥ 1.1). No Node.js runtime path. A Cloudflare Workers adapter exists ([§23](../README.md#23-custom-adapters)).         |
| Vite (plugins, `vite.config.ts`)         | `Bun.build`. **Vite plugins do not work.** Bun plugins go in `bractjs.config.ts` → `plugins` ([§24](../README.md#24-build-plugins)). |
| Deploy to a Node host / Vercel / Netlify | `bractjs start` on a Bun host, or `bractjs compile` → one self-contained executable ([deployment](deployment.md)).                   |
| React 18 or 19                           | React 19 only.                                                                                                                       |

If you depend on a Node-only library or a Vite plugin, check it works with Bun first — that's the one thing a port can't route around.

## Project setup

Start from a scaffold (`bunx @bractjs/bractjs new my-app`) and move your code in, or convert in place:

```sh
bun remove @remix-run/react @remix-run/node @remix-run/dev   # or react-router, @react-router/*
bun add @bractjs/bractjs react@^19 react-dom@^19
bun add -d @types/bun @types/react @types/react-dom
```

```jsonc
// package.json
"scripts": {
  "dev": "bractjs dev",                                // was: remix vite:dev / react-router dev
  "build": "NODE_ENV=production bractjs build",        // was: remix vite:build / react-router build
  "start": "NODE_ENV=production bractjs start",        // was: remix-serve ./build/server/index.js
  "compile": "NODE_ENV=production bractjs compile"     // new: single binary
}
```

Delete `vite.config.ts`, `react-router.config.ts`, and (RR7) `app/routes.ts`. Copy the scaffold's `tsconfig.json` — it sets `allowImportingTsExtensions`, which BractJS relies on because imports keep their `.ts`/`.tsx` extensions. Add `app/_generated/` and `app/route-types.gen.ts` to `.gitignore`; both are codegen output.

### Files that change role

| Remix / RR7                                  | BractJS                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app/root.tsx` with `Layout` + `App` exports | `app/root.tsx` — one `default` export that returns the whole `<html>` document ([§3](../README.md#3-the-root-layout-approotsx)).   |
| `<Meta />`, `<Links />` in root              | **Remove both.** `meta()` output is hoisted into `<head>` automatically; imported CSS is linked automatically.                     |
| `<Scripts />`, `<ScrollRestoration />`       | Same components, imported from `@bractjs/bractjs`. Add `<LiveReload />` (dev HMR; renders nothing in production).                  |
| `entry.server.tsx`, `server.js` / Express    | `app/server.ts` (global middleware via `pipeline.use(...)`) plus `app/lifecycle.ts` (`onStart` / `onShutdown` / `onError`).        |
| `entry.client.tsx`                           | No equivalent — hydration is built in.                                                                                             |
| `app/routes.ts` (RR7 config routes)          | No equivalent — routing is file-based only.                                                                                        |
| `public/` served at `/`                      | `public/` is served at **`/public/*`**. `public/favicon.ico` is `/public/favicon.ico` — update `<link rel="icon">` and asset URLs. |

## Route file names

BractJS uses nested folders plus brackets rather than Remix's dot-delimited flat files ([§4](../README.md#4-file-based-routing)).

| Remix v2 flat routes / RR7 `flatRoutes()`         | BractJS                                  | URL                                               |
| ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `_index.tsx`                                      | `_index.tsx`                             | `/`                                               |
| `about.tsx`                                       | `about.tsx`                              | `/about`                                          |
| `blog._index.tsx`                                 | `blog/_index.tsx`                        | `/blog`                                           |
| `blog.$id.tsx`                                    | `blog/[id].tsx`                          | `/blog/:id`                                       |
| `blog.tsx` (parent with `<Outlet />`)             | `blog/layout.tsx`                        | wraps every `/blog/*` route                       |
| `($lang).about.tsx`                               | `[[lang]]/about.tsx`                     | `/about` and `/:lang/about`                       |
| `docs.$.tsx`                                      | `docs/[...slug].tsx`                     | `/docs/*` — read `params.slug`, not `params["*"]` |
| `_auth.login.tsx` + `_auth.tsx` (pathless layout) | `(auth)/login.tsx` + `(auth)/layout.tsx` | `/login`                                          |
| `blog_.$id.edit.tsx` (escape parent layout)       | `(standalone)/blog/[id]/edit.tsx`        | `/blog/:id/edit`, without `blog/layout.tsx`       |

The last row works because layouts come from the file's _folder_ chain, not the URL: a route under `(standalone)/blog/` is wrapped by `(standalone)/layout.tsx` and `(standalone)/blog/layout.tsx` if they exist, never by `blog/layout.tsx`. Remix's `[.]` escaping (`sitemap[.]xml.tsx`) has no equivalent — see [resource routes](#resource-routes).

## Imports

Everything comes from one package — `@remix-run/react`, `@remix-run/node`, `react-router`, and `@react-router/node` imports all become `@bractjs/bractjs`:

```ts
// before
import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
// after
import { json, redirect, type LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useLoaderData } from "@bractjs/bractjs";
```

Type names: `LoaderFunctionArgs` / `Route.LoaderArgs` → `LoaderArgs`, `ActionFunctionArgs` / `Route.ActionArgs` → `ActionArgs`, `MetaFunction` / `Route.MetaArgs` → `MetaArgs<typeof loader data>`. RR7's generated `./+types/...` imports go away; for typed params, search and links, run codegen instead ([§18](../README.md#18-typed-routes)).

## Route module exports

| Remix / RR7                                       | BractJS                                                                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader({ request, params, context })`            | Same, plus `search` (validated query params when the route has a `searchSchema`).                                                                                          |
| `action({ request, params, context })`            | Same, plus a pre-parsed **`formData`** argument. `await request.formData()` also still works — it returns the same parsed copy.                                            |
| `meta({ data, params, matches })`                 | `meta({ loaderData, params })` — rename `data` → `loaderData`. No `matches`/`location`. Same descriptor array format.                                                      |
| `links()`                                         | **Not supported.** Import the stylesheet (`import "./route.css"`); other `<link>` tags go in `root.tsx`. The dev server and build warn when a route still exports `links`. |
| `headers()`, `handle`, `shouldRevalidate`         | Same names and roles.                                                                                                                                                      |
| `clientLoader`, `clientAction`, `.hydrate = true` | Same, including `serverLoader()` / `serverAction()`.                                                                                                                       |
| `HydrateFallback`                                 | `export const ssr = false` (or `"data-only"`) plus `export function Fallback()`.                                                                                           |
| `middleware` / `unstable_middleware` (RR7)        | `middleware` — an array of `(ctx, next) => Response`, running root → layouts → route. **Scope differs; read [Middleware](#middleware-and-auth).**                          |
| `ErrorBoundary` + `useRouteError()`               | `ErrorBoundary` receives the error as a prop: `function ErrorBoundary({ error })`. There is no `useRouteError` / `isRouteErrorResponse`. See [known gaps](#known-gaps).    |
| `Route.ComponentProps` (`loaderData` prop)        | Components receive no props — use `useLoaderData<typeof loader>()`.                                                                                                        |
| —                                                 | New: `beforeLoad` (auth/redirect gate that also guards `/_data`), `searchSchema`, `context` via `defineContext` ([§5](../README.md#5-route-module-api)).                   |

## Responses and data

- **Returning plain objects** from loaders and actions works as in RR7. `json(data, init)` exists for when you need a status or headers; it replaces RR7's `data(value, init)`.
- **`redirect()`** accepts both the Remix/RR7 form `redirect(url, { status, headers })` and the positional form `redirect(url, 303, headers)`. It refuses off-origin URLs unless you pass `allowExternal: true` — a Remix `redirect("https://…")` needs that added.
- **Streaming: wrap promises in `defer()`.** RR7 streams any promise you return; BractJS only streams fields wrapped with `defer({ … })`. `<Await resolve={…}>` works the same, with the render function as its child ([§8](../README.md#8-streaming-data)).
- **Throwing `redirect()` / `new HttpError(404)`** works as control flow. See [known gaps](#known-gaps) for how an `HttpError` currently reaches the browser.

## Hooks and components

| Remix / RR7                                                                                  | BractJS                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `useLoaderData`, `useActionData`, `useParams`, `useLocation`, `useMatches`, `useRevalidator` | Same.                                                                                                                                     |
| `useNavigation()` → `{ state, formData, location }`                                          | `useNavigation()` → `{ state }` only. For optimistic UI read `formData` from `useFetcher()` / `useFetchers()`.                            |
| `useSubmit()`                                                                                | No hook. Use `<Form>`, `useFetcher().submit(url, { method, body })`, or `useNavigate()`.                                                  |
| `fetcher.submit(data, { method, action })`                                                   | `fetcher.submit(action, { method, body })` — the **URL comes first**.                                                                     |
| `useSearchParams()` → `[params, setParams]`                                                  | `useSearchParams()` → `{ searchParams, getParam, setSearchParams }` — an object, not a tuple. Prefer `useSearch()` with a `searchSchema`. |
| `useNavigate()`                                                                              | Same call shape; returns a `Promise`.                                                                                                     |
| `useBlocker(fn)` → blocker object                                                            | `useBlocker(() => boolean)` — shows the browser's confirm prompt; no `blocker.proceed()` / `reset()`.                                     |
| `useRouteLoaderData(id)`                                                                     | `useMatches().find((m) => m.id === "routes/blog/layout.tsx")?.data` — ids are app-relative file paths (`root.tsx`, `routes/…`).           |
| `useOutletContext()` / `<Outlet context>`                                                    | Not supported — share via React context or loader data.                                                                                   |
| `<Form>`, `<Link prefetch>`, `<Link viewTransition>`, `<ScrollRestoration>`, `<Await>`       | Same. `<Form>` also takes an `intent` prop that pairs with `defineActions` for multi-button forms.                                        |

## Sessions

```ts
// before
const { getSession, commitSession, destroySession } = createCookieSessionStorage({
  cookie: {
    name: "__session",
    secrets: [process.env.SESSION_SECRET!],
    sameSite: "lax",
    secure: true,
    maxAge: 604_800,
  },
});
// after — flat options; sameSite is capitalized
export const session = createCookieSession({
  name: "__session",
  secrets: [Bun.env.SESSION_SECRET!], // each ≥ 16 chars
  sameSite: "Lax",
  secure: true,
  maxAge: 604_800,
});
```

`getSession(cookieHeader)` and `commitSession(session)` keep their names. There's no `destroySession`; commit with `{ maxAge: 0 }` instead. Only cookie-backed sessions ship; for server-side storage, keep a session ID in the cookie and look it up yourself. ([§15](../README.md#15-sessions))

## Middleware and auth

This is the difference most likely to hurt you. In RR7, route middleware runs for every request that reaches that route. In BractJS, a `middleware` or `beforeLoad` export on a route or layout guards **only that route's pages and their `/_data` JSON**:

- **Typed `/api` endpoints** are not covered. Guard them with `route(..., { middleware: [...] })`.
- **`"use server"` functions** (`/_action`) are not covered.
- **Global middleware** — `pipeline.use(...)` in `app/server.ts` — covers everything.

The [authentication guide](authentication.md) walks through all of it. Do not port an `admin.tsx` layout's auth middleware and assume the admin API is protected.

## Resource routes

A Remix "resource route" (a route with a `loader` and no component, returning a `Response`) has no direct equivalent — a loader's return value is always page data.

- For JSON or other endpoints under `/api`, use typed API routes: `route("GET", "/api/feed", handler)`. The defining module must be imported (directly or indirectly) from `app/root.tsx`, or the endpoint won't exist; `bractjs dev` warns at boot if you forget ([§12](../README.md#12-typed-api-routes)).
- For fixed files at the root (`/robots.txt`, `/sitemap.xml`, `/favicon.ico`), add a small global middleware in `app/server.ts` that answers those paths:

```ts
// app/server.ts
pipeline.use(async (ctx, next) => {
  const { pathname } = new URL(ctx.request.url);
  if (pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
  if (pathname === "/sitemap.xml")
    return new Response(await buildSitemap(), { headers: { "Content-Type": "application/xml" } });
  return next();
});
```

## Environment variables and server-only code

- **`.server.ts` modules** work like Remix's `.server` convention, but a client import is **stubbed**, not a build error. Calling a stub on the client throws.
- **Client env vars:** there is no `import.meta.env.VITE_*`. List the keys in `bractjs.config.ts` → `clientEnv: ["PUBLIC_API_URL"]` and read `process.env.PUBLIC_API_URL` in client code. Any other `process.env.*` becomes `undefined` in the browser. On the server, use `Bun.env` ([§17](../README.md#17-environment-variables)).

## Styling

Plain CSS imports (`import "./styles.css"`) work in every run mode and are split per route automatically. Tailwind v4 is one flag (`tailwind: true`) ([§28](../README.md#28-styling)).

**CSS Modules are the exception:** `*.module.css` class names don't match between server and client, so server-rendered elements come out unstyled and hydration mismatches. Port CSS Modules used in server-rendered components to plain CSS (or Tailwind) before switching.

## Known gaps

As of 0.4.x, these have no clean equivalent. Plan around them:

- **Thrown `HttpError`s are not rendered by `ErrorBoundary`.** On a direct page load, `throw new HttpError(404, "…")` from a loader or action returns a JSON body (`{"error":"…"}`) with that status, not your route's error UI. During client-side navigation, the router logs the failed `/_data` request and stays on the current page. `ErrorBoundary` currently catches errors thrown while _rendering_. Until this is fixed, render not-found states from the component (for example, return `{ notFound: true }` from the loader and branch on it).
- **No `useOutletContext`, `useSubmit`, `useRouteError`, or `links` export.** Replacements are listed in the tables above.
- **No Vite ecosystem, no Node runtime** — see [platform differences](#before-you-start-platform-differences).

## Porting checklist

1. Swap dependencies and scripts; delete the Vite/RR config; copy the scaffold `tsconfig.json`.
2. Rewrite `root.tsx` as a single `default` export; remove `<Meta />` / `<Links />`; add `<LiveReload />`.
3. Rename route files using the [table above](#route-file-names); move `public/` URLs under `/public/`.
4. Replace imports with `@bractjs/bractjs`; rename `data` → `loaderData` in `meta`; replace `links()` with CSS imports.
5. Wrap streamed promises in `defer()`; check `redirect()` calls to other origins for `allowExternal`.
6. Replace `useSubmit`, `useOutletContext`, `useRouteError` and tuple-style `useSearchParams`; check `fetcher.submit` argument order.
7. Port sessions to `createCookieSession`; move `destroySession` to `commitSession(s, { maxAge: 0 })`.
8. Re-check every auth guard against [Middleware and auth](#middleware-and-auth) — especially `/api` and `"use server"`.
9. Convert resource routes to typed `/api` routes or `app/server.ts` middleware.
10. Run `bractjs dev` and read the boot output: it warns about unregistered `/api` endpoints, miscased route exports, and leftover Remix exports such as `links`.
