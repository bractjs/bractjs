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

- [x] `node:fs` `watch()` file watcher with 50ms debounce
- [x] HMR WebSocket server (configurable via `hmrPort`, default 3001)
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
- [x] Production server (`bractjs start` loads manifest)
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
- [x] `programmatic-api.test.ts` — `createDevServer`, `runBuild`, `loadUserConfig` exports + `BuildConfig` type narrowing

---

## Future (Post v0.1.0)

- [x] Module-level HMR (no full reload — fine-grained module swap)
- [x] Edge runtime support — Cloudflare Workers adapter (`createCloudflareAdapter`, `src/adapters/cloudflare.ts`)
- [ ] Edge runtime support — Deno / Node.js adapters (generalize the adapter contract)
- [x] Built-in CSS modules (`cssModulesPlugin`, `src/build/plugins/css-modules.ts`)
- [x] Image optimization pipeline (`<Image>`, `/_image` handler)
- [x] Typed routes (codegen — `route-types.gen.ts`, `src/codegen/route-codegen.ts`)
- [x] Typed routes (codegen — `params` typed per route via `RouteParams<T>`)
- [x] Typed routes (runtime-wired — `<Link>`/`useNavigate`/`useParams` consume the generated types via the `Register` seam; v0.1.27)
- [x] `"use server"` / `"use client"` directive system
- [ ] Built-in i18n routing (helpers exist: `wrapRoutesWithLocale`, `stripLocale`, `useLocale`; not yet integrated end-to-end into core routing)
- [x] Streaming `useFetcher()` (SSE-backed — `useFetcher({ stream: true })`, `/_stream`, `src/server/stream-handler.ts`)
- [x] Programmatic API — `createDevServer`, `runBuild`, `loadUserConfig` importable without CLI
- [x] Native `bun build --compile` support — single-binary deployment via module-registry codegen (`bractjs codegen:registry`, `bractjs codegen:manifest`, `bractjs compile`)

---

## Phase A — Type Completeness

> Highest leverage additions — no new runtime dependencies, closes the biggest DX gaps vs TanStack Router and React Router.

- [x] `useSearchParams()` hook — reads/writes URL search params, triggers loader re-run on change (`src/client/hooks/useSearchParams.ts`)
- [x] `useSearchParams()` — typed/registry-wired per route (`SearchFor<T>` via the `Register` seam); superseded for most uses by the validated `useSearch()` (Phase F)
- [x] Typed route context — codegen emits `Context<T>` + augmentable `RouteContextMap` (`route-types.gen.ts`); `defineContext()` factory exists (`src/server/context.ts`)
- [x] `beforeLoad()` on route definitions — client-side navigation guard with safe redirect following (`src/client/ClientRouter.tsx`); unsaved-form blocking via `useBlocker()`
- [x] **Typed-routing runtime wiring** — `<Link>`/`useNavigate`/`useParams`/`useSearchParams` consume the generated types via the `Register` declaration-merging seam (v0.1.27)

---

## Phase B — Performance Primitives

> Makes navigating data-heavy apps feel instant. Critical for dashboards, admin panels, paginated lists.

- [x] Loader caching with `staleTime` / `gcTime` — SWR semantics: serve cached data instantly, revalidate in background (`src/client/ClientRouter.tsx`, `src/client/cache.ts`)
- [x] `loaderDeps` — route modules export `loaderDeps({ searchParams })` to key the loader cache
- [x] Streaming `useFetcher()` via SSE — live data without WebSockets (`useFetcher({ stream: true })` + `/_stream`)

---

## Phase C — Full-Stack DX

> Closes the type-safety gap for API routes; reduces action boilerplate.

- [x] Type-safe API route client — `route()` + `createClient<AppApiRoutes>()` typed fetch client (`src/server/api-route.ts`, `src/client/rpc.ts`)
- [x] Action validator helper — `validate(schema)` auto-validates FormData/JSON, returns typed body, throws 400 `Response` on failure (`src/server/validate.ts`)

---

## Phase D — Runtime Portability

> Unlocks adoption beyond Bun-only deployments.

- [x] Adapter interface — `BractAdapter` / `BunAdapter` abstract the serve layer (`src/server/adapter.ts`)
- [x] Cloudflare Workers adapter — first non-Bun target (`createCloudflareAdapter`, `src/adapters/cloudflare.ts`)
- [ ] Deno / Node.js adapters — second/third targets to fully validate the adapter contract
- [x] CSS modules — scoped styles, build-time class-name hashing (`cssModulesPlugin`, `src/build/plugins/css-modules.ts`)

---

## Phase E — Polish

> Low-effort, high-visibility improvements.

- [x] View Transitions API — `viewTransition` prop on `<Link>`, feature-detected (`src/client/components/Link.tsx`)
- [~] Built-in i18n routing — locale-prefix helpers shipped (`wrapRoutesWithLocale`, `stripLocale`, `useLocale`, `useLocalizedLink`); not yet wired into core routing as a one-line opt-in
- [x] DevTools panel — in-browser overlay (Ctrl+Shift+B) showing matched route, loader data, nav state, cache entries (`src/dev/devtools.ts`)

---

## Phase F — Navigation & Data UX (parity with React Router v7 / TanStack Router)

> Closes the gap analysis against React Router v7 framework mode and TanStack Router/Start.

- [x] `RouterLocation` + `useLocation()` — reactive location with history-entry `key` + `state`; SSR-safe (`src/client/hooks/useLocation.ts`)
- [x] History keys + `navigate(to, { replace, state })` — entries stamped via `history.state.__bractKey` (`src/client/ClientRouter.tsx`, `src/client/nav-utils.ts`)
- [x] `<ScrollRestoration />` — back/forward + reload scroll restore, hash anchors, sessionStorage persistence (`src/client/components/ScrollRestoration.tsx`, `src/client/scroll-restoration.ts`)
- [x] Link prefetch modes — `intent` / `viewport` (shared IntersectionObserver) / `render`; prefetch now warms the loader cache with dedupe + concurrency cap (`src/client/prefetch.ts`)
- [x] Typed validated search params — `searchSchema` route export validated server-side before loaders (`src/server/search.ts`); `args.search` in loaders; `useSearch()` / `useSetSearch()` typed via codegen schema inference (`Register.routes.searchOutput`); `<Link search>` / `navigate({ search })` (`src/client/hooks/useSearch.ts`, `src/codegen/route-codegen.ts`)
- [x] `useRevalidator()` — manual revalidation with separate `revalidationState` (`src/client/hooks/useRevalidator.ts`)
- [x] `shouldRevalidate` route export — gates SWR background refetch + post-mutation revalidation (`src/shared/route-types.ts`, `src/client/ClientRouter.tsx`)
- [x] Real `submit()` / `useNavigation()==="submitting"` — `<Form>` drives submitting → loading → idle through the router (`src/client/ClientRouter.tsx`, `src/client/components/Form.tsx`)
- [x] Fetcher store + optimistic UI — `useFetcher({ key })`, `fetcher.formData`/`formMethod`, `<fetcher.Form>`, `useFetchers()`, auto-revalidation + cache invalidation after mutations (`src/client/fetcher-store.ts`, `src/client/hooks/useFetcher.ts`, `src/client/hooks/useFetchers.ts`)
- [x] Soft-nav meta fix — `/_data` carries merged `meta` so the document head survives navigation (`src/server/request-handler.ts`)

## Phase G — Rendering Modes

- [x] Per-route selective SSR — `export const ssr = false | "data-only"` + `Fallback` (HydrateFallback equivalent); hydrate-then-swap on the client; `beforeLoad` always server-enforced (`src/server/request-handler.ts`, `src/client/components/Outlet.tsx`)
- [x] SPA mode — config `ssr: false` serves a static shell for all document GETs; build emits `build/client/__spa.html`; loaders/actions/CSRF unaffected (`src/server/spa.ts`, `src/server/serve.ts`, `src/build/bundler.ts`)
- [x] Prerendering / SSG — config `prerender`; build-time HTML + `/_data` payloads under `build/client/_prerender/`; production serves clean URLs from disk, query strings stay dynamic (`src/build/prerender.ts`)
- [ ] Prerender assets embedded INSIDE the compiled binary (today: ship `build/client/` alongside it, or via `--asset`)

## Phase H — RR7 / TanStack gap-closure (round 2)

> Second pass against React Router v7 framework mode and TanStack Start, closing the remaining nesting / caching / data-loading gaps.

- [x] Route `headers` export — per-route `Cache-Control`/`ETag`/`Vary`/CDN headers, merged root → layout → route (innermost wins), applied to the document **and** `/_data` responses; `Content-Type`/`Transfer-Encoding` stay framework-owned (`src/server/headers.ts`, `src/server/render.ts`, `src/server/request-handler.ts`; `HeadersFunction`/`HeadersArgs` in `src/shared/route-types.ts`)
- [x] `useMatches()` — matched chain (root → layouts → route) as `RouteMatch[]` for breadcrumbs / conditional chrome from each route's `handle`; SSR-safe, updates on soft-nav + revalidation (`src/client/hooks/useMatches.ts`, `src/server/matches.ts`, wired through `ClientRouter`/`BractJSContext`)
- [x] Route groups `(group)/` — parenthesized folders group files + their `layout.tsx` without adding a URL segment; layout dirs derived from the file path so a folder's `_index` is wrapped too (`src/server/scanner.ts` `layoutDirsFromFilePath`/`isRouteGroupSegment`, `src/server/layout.ts`, `src/codegen/module-registry.ts`)
- [x] Optional segments `[[id]]` — match with/without the segment (param unset when absent); ranked above catch-all, below required param/static (`src/server/scanner.ts`, `src/server/matcher.ts` `optionalChild`, `src/codegen/route-codegen.ts`)
- [x] Nested route middleware — `export const middleware` (fn or array) runs root → layout → route before `beforeLoad`/action/loaders with a shared mutable `context`; short-circuits via a returned `Response`; protects the document and `/_data`; runs inside the global `pipeline` (`src/server/middleware.ts` `runRouteMiddleware`/`collectRouteMiddleware`, `src/server/request-handler.ts`)
- [x] `clientLoader` / `clientAction` — RR7-style browser-side data with `serverLoader()`/`serverAction()` escape hatches; `clientLoader.hydrate = true` opts into running on the initial hydration of an SSR'd document (`src/client/ClientRouter.tsx`; `ClientLoaderFunction`/`ClientActionFunction` in `src/shared/route-types.ts`)

---

## v0.2.x — Shipped

> Released as 0.2.0 (2026-06-16), 0.2.1 (2026-06-21), 0.2.2 (2026-06-23). See `CHANGELOG.md` for details.

- [x] pnpm workspace monorepo layout finalized; framework published unchanged from `packages/core` (0.2.0)
- [x] Toast notifications — `<Toaster />`, `useToast()`, shared toast store, flash-message integration (0.2.1)
- [x] Security: adapter-agnostic catch-all for unhandled request errors; `BunAdapter` no longer leaks `err.message` in production (0.2.1)
- [x] Security: `X-Content-Type-Options: nosniff` on all static responses (0.2.2)
- [x] CSP middleware surface (`csp()`, `CspOptions`, `CSP_NONCE_KEY`, `getCspNonce`) declared in the public types (0.2.2)

---

## v0.3 — Planned

- [ ] Remove deprecated `StreamFetcherResult.events` (deprecated since 0.2)
- [ ] **Known gap:** `app/lifecycle.ts` is auto-loaded by `bractjs dev` but NOT by `bractjs start` — production hooks must live in `bractjs.config.ts` today. Fix needs a codegen'd static import to stay compatible with `bun build --compile` (dynamic user-file imports break the single-binary path)
- [ ] Deno / Node.js adapters — validate the adapter contract beyond Bun + Cloudflare (carried from Phase D)
- [ ] Built-in i18n routing wired end-to-end as a one-line opt-in (carried from Phase E)
- [ ] Prerender assets embedded inside the compiled binary (carried from Phase G)
- [ ] CI (GitHub Actions), lint/format (ESLint + Prettier), and a type-surface drift guard for the hand-maintained `types/*.d.ts`
