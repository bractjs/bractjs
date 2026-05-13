# BractJS — Roadmap

> A production-grade SSR web framework built on Bun.sh + React 19.
> Track implementation progress across all phases.

---

## Phase 0 — Project Scaffold

- [x] Repo init (`package.json`, `tsconfig.json`, `.gitignore`)
- [x] CLI entry (`bin/cli.ts`)
- [x] Stub `README.md`
- [x] Shared types (`src/shared/route-types.ts`, `errors.ts`, `deferred.ts`)
- [x] Context + response utils (`src/shared/context.ts`, `src/server/response.ts`, `src/server/env.ts`)
- [x] SSR render wrapper (`src/server/render.ts`)
- [x] `<Scripts />` component (`src/client/components/Scripts.tsx`)
- [x] `<LiveReload />` component (`src/client/components/LiveReload.tsx`)
- [x] `<Outlet />` stub (`src/client/components/Outlet.tsx`)

---

## Phase 1a — Static SSR Shell

- [x] `Bun.serve()` entry
- [x] `renderToReadableStream()` wrapper
- [x] `bootstrapScriptContent` with `window.__BRACTJS_DATA__` inline
- [x] `<Scripts />` component
- [x] `<LiveReload />` component (dev-only stub)
- [x] `<Outlet />` component (stub)
- [x] Root layout convention (`app/root.tsx`)

---

## Phase 1b — Routing + Loaders

- [x] `scanRoutes()` with `Bun.Glob`
- [x] File path → URL pattern conversion (`[id]` → `:id`, `[...slug]` → `*`)
- [x] Route trie matcher (static > param > catch-all priority)
- [x] Layout chain resolution (`root → layout → route`)
- [x] Parallel loader execution (`Promise.all`)
- [x] `safeLoader()` error isolation (`safeRun()` in `src/server/loader.ts`)
- [x] `defer()` helper
- [x] `/_data?path=` soft-nav JSON endpoint
- [x] Action handler (`POST`/`PUT`/`DELETE`)
- [x] `redirect()` support in loaders and actions

---

## Phase 2 — Client Hydration + Navigation

- [x] `hydrateRoot()` entry (`src/client/entry.tsx`)
- [x] `RouterContext` + `NavigationContext`
- [x] `ClientRouter` component with `startTransition` state updates
- [x] `useLoaderData()`
- [x] `useActionData()`
- [x] `useParams()`
- [x] `useNavigation()` (`idle` | `loading` | `submitting`)
- [x] `useFetcher()` (independent fetch/submit)
- [x] `<Link>` with soft navigation + `prefetch="hover"`
- [x] `<Form>` with fetch-based submission + loader re-run
- [x] `<Outlet>` with `React.lazy()` route rendering
- [x] `document.title` + `<meta>` tag updates on navigation
- [x] Browser back/forward (`popstate`) support

---

## Phase 3 — Dev Experience

- [x] `Bun.watch()` file watcher with 50ms debounce
- [x] HMR WebSocket server (port 3001)
- [x] HMR browser client (auto-reload on `hmr` message)
- [x] Dev error overlay (injected into HTML shell)
- [x] `DefaultErrorBoundary` (stack trace in dev, generic message in prod)
- [x] `RouteErrorBoundary` class component
- [x] `meta()` full resolution (merge + dedup, last-writer-wins)
- [x] `<meta>` SSR injection into `<head>`
- [x] `<Await>` component + `defer()` Suspense streaming

---

## Phase 4 — Build System

- [x] Content hash utility (`SHA-256`, 8-char prefix)
- [x] Route manifest generator (`build/route-manifest.json`)
- [x] `.server.ts` import guard Bun plugin
- [x] `clientEnv` allowlist plugin (`process.env` define stripping)
- [x] Server bundle (`Bun.build()` — target `bun`)
- [x] Client bundle (`Bun.build()` — target `browser`, code splitting)
- [x] Route code splitting (one chunk per route)
- [x] Asset renaming with content hash
- [x] Production server (`tidewake start` loads manifest)
- [x] `Cache-Control: immutable` for hashed client assets

---

## Phase 5 — Polish

- [x] Middleware pipeline (`MiddlewarePipeline`, `use()`, `compose()`)
- [x] `requestLogger` middleware
- [x] `cors()` middleware
- [x] `authGuard()` middleware
- [x] `createCookieSession()` with HMAC-SHA256 signing
- [x] Secret rotation support (`secrets: [current, ...previous]`)
- [x] TypeScript declaration files (`types/`)
- [x] `bractjs new <app-name>` scaffold command
- [x] Starter template (`templates/new-app/`)
- [x] `README.md` finalized
- [x] `CHANGELOG.md` — v0.1.0 entry

---

## v0.1.0 — Target Checklist

All Phase 0–5 items complete. Acceptance criteria passing:

- `bunx bractjs new my-app` scaffolds a runnable app in under 10 seconds
- `bractjs dev` starts in under 2 seconds, HMR rebuilds in under 500ms
- `bractjs build` produces deterministic content-hashed output
- `bractjs start` serves the production build with correct cache headers
- No server-only code in any client chunk
- Full TypeScript types exported from package root
- SSR renders full page HTML without `ClientRouter` (hooks/components are SSR-safe)

---

## Security Hardening

- [x] HMAC cookie verification: confirmed constant-time (XOR accumulate)
- [x] `bootstrapScriptContent` XSS: confirmed safe via `safeStringify` unicode escapes
- [x] Static file path traversal: confirmed safe (pre-check + canonical resolve guard)
- [x] Dev error overlay XSS: fixed (`innerHTML` → DOM API `textContent`)
- [x] `.server.ts` guard extensionless bypass: fixed (`/\.server(\.(tsx?|jsx?))?$/`)
- [x] `clientEnv` / `Bun.env` leak: confirmed safe (allowlist only)

---

## Test Suite

- [x] `matcher.test.ts` — route trie, static/param/catch-all priority
- [x] `scanner.test.ts` — `filePathToPattern`, `pathToSegments`
- [x] `loader.test.ts` — `safeRun`, `runLoaders`, `buildLoaderArgs`
- [x] `meta.test.ts` — `mergeMeta`, `renderMetaTags`
- [x] `session.test.ts` — `createCookieSession` roundtrip + HMAC rotation
- [x] `integration.test.ts` — live `Bun.serve` HTML/JSON/action/404
- [x] `errors.test.ts` — `BractJSError`, `HttpError`, type guards
- [x] `deferred.test.ts` — `defer`, `isDeferred`, `stripDeferred`, `promisesOf`
- [x] `response.test.ts` — `redirect`, `json`, `error` helpers
- [x] `env.test.ts` — `safeStringify` (XSS escaping), `requireEnv`
- [x] `middleware.test.ts` — `MiddlewarePipeline`, `cors()`, `authGuard()`, `requestLogger()`
- [x] `manifest.test.ts` — `generateManifest`
- [x] `action-handler.test.ts` — `handleActionRequest` routing guards, `resolveAction`

---

## Future (Post v0.1.0)

- [x] Module-level HMR (no full reload — fine-grained module swap)
- [ ] Edge runtime support (Cloudflare Workers, Bun Deploy)
- [ ] Built-in CSS modules
- [x] Image optimization pipeline
- [x] Typed routes (codegen)
- [x] Typed routes (codegen — `params` typed per route)
- [x] `"use server"` / `"use client"` directive system
- [ ] Built-in i18n routing
- [ ] Streaming `useFetcher()` (SSE-backed)
