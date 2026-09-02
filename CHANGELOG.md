# Changelog

All notable changes to BractJS are documented here.

---

## [Unreleased]

### Added

- **Styling now works out of the box — `import "./styles.css"` is the entire setup.** Previously BractJS had no CSS story you could actually use: `*.module.css` resolved to a JS module that built a `<style>` tag *at runtime*, so SSR shipped unstyled HTML and the styles only appeared after hydration (a guaranteed flash of unstyled content, and nothing at all for no-JS clients), while a plain `.css` import was bundled to a file that nothing ever referenced. The build now collects the stylesheets Bun extracts for each entry-point (via `Bun.build({ metafile: true })` → `cssBundle`), content-hashes them alongside the JS, and records them in the route manifest (`entryCss` / `rootCss` / `routes[pattern].css`); the server renders `<link rel="stylesheet">` into the **streamed HTML**, so documents arrive styled. Because the client build already uses one entrypoint per route, **per-route CSS splitting is automatic** — `/` never downloads `/about`'s styles. The links are rendered with React 19's `precedence`, which dedupes by href across the server and client trees and makes the router wait for an incoming route's stylesheet to load before committing, so soft navigation never paints unstyled. Hashed CSS inherits the existing immutable `Cache-Control`, and all three run modes (`dev`, `start`, compiled binary) emit identical links. New `collectCssBundles` export on `@bractjs/bractjs/build` for custom `Bun.build` pipelines.
- **Zero-config Tailwind v4 via `tailwind: true`.** Install `bun-plugin-tailwind` + `tailwindcss`, set the flag, and import a stylesheet containing `@import "tailwindcss";` — Tailwind compiles inside the bundle and its output flows through the same extract → hash → link path. No `tailwindcss` CLI invocation, no `predev`/`prebuild`/`precompile` scripts, and no hand-written `<link>`. Setting the flag without the plugin installed fails the build with an actionable message instead of silently producing no styles. `examples/cms` is migrated to this: it drops three npm scripts, the `@tailwindcss/cli` dependency (and its 14 platform binaries), and its manual `<link>` — verified to emit a byte-for-byte equivalent selector set (zero missing selectors).
- **CSS hot-swap in dev — no page reload.** Editing a `.css` file now broadcasts a new `hmr:css` message; the browser re-points the affected `<link>` hrefs at a cache-busted URL in place, so styles update without reloading the page or losing client state (previously any CSS edit forced a full reload). A `.css` file living under `routes/` is also no longer mistaken for a route module.
- **`bractjs codegen:seed` generates ambient CSS types** (`app/_generated/css.d.ts`), so `import "./x.css"` and `import styles from "./x.module.css"` typecheck with no per-app `.d.ts` boilerplate.

- **A `docs/` guide set now complements the README reference**: a 15-minute [tutorial](docs/tutorial.md) (routes → loaders → validated forms → typed `/api` → single binary), a [concepts guide](docs/concepts.md) covering the request lifecycle, the three run modes, and what ships to the client, an end-to-end [authentication guide](docs/authentication.md) built around the middleware-scoping rules (what each guard surface does and does not cover), and a [deployment guide](docs/deployment.md) with a production checklist. The README stays the API reference; the guides are the learning path, and the README now links to them.
- **`app/server.ts` is now loaded in every run mode, so global middleware behaves identically in dev, start, and the compiled binary.** Previously the file only ever executed as the `bun build --compile` entrypoint: `pipeline.use(cors()/csp()/…)` registered there silently did nothing under `bractjs dev` **and** `bractjs start`, a dev/prod divergence that made globally-registered auth/CSP/CORS unverifiable in development. `bractjs dev` and `bractjs start` now import the file at boot for its side effects with its module-scope `createServer()` call suppressed (no second server/port bind; existing apps need no changes). Missing `_generated/*` files are seeded automatically before the import so a fresh clone still boots; an import failure is a loud warning, never silent. Editing `server.ts` in dev still requires a restart, like all server modules.
- **`bractjs start` picks up `app/lifecycle.ts` automatically** (parity with `bractjs dev`): `onStart`/`onShutdown`/`onError` hooks — including the documented Sentry/Datadog `onError` wiring — no longer require a custom entry file in production. A `lifecycle.ts` that exists but fails to import now warns instead of being silently ignored (both dev and start).
- **`csp()` is dev-aware and `<LiveReload>` is nonced.** Under `bractjs dev`, `csp()` appends the HMR websocket (`ws://localhost:<hmrPort>`) to `connect-src` — including over a user-supplied `connect-src` — and the injected inline HMR client now carries the per-request CSP nonce (threaded through the render pipeline via an internal React context), so `'strict-dynamic'` trust flows to the route chunks it hot-swaps and to the devtools module. Net effect: CSP can stay enabled in development instead of being conditionally skipped and never verified. Non-dev behavior is unchanged.
- **`bractjs codegen:seed [app]`** — seeds `<app>/_generated/` (route/action registries + typed routes + a manifest stub) so `app/server.ts` typechecks on a fresh clone without first running a build. This is the same seeding `bractjs new` does; the two now share one implementation.

### Added

- **Edited loaders, actions, and `beforeLoad` hooks are now live in dev — no restart.** The dev server re-imports a changed route module (cache-busted) on the next request and re-registers its `"use server"` bodies, so the previous "restart after editing a loader" gotcha is gone. `bractjs start` and compiled binaries always import the plain specifier — nothing changes outside the dev runtime.
- **Typed API routes accept per-endpoint middleware**: `route(method, path, handler, { middleware: [...] })`. The chain runs after the CSRF gate and before body parsing (an auth gate rejects before the payload is buffered), can short-circuit with a `Response`, and shares `ctx.context` with the handler — which now receives the middleware context as a third argument, including `ctx.params` with the matched `:param` segment values (previously not surfaced at all). This closes the long-standing gap where nested route `middleware` exports don't cover `/api`, so guarding an endpoint meant hand-rolling auth inside every handler. Existing two-argument handlers are unaffected.
- **The dev server warns at boot about typed API routes that silently don't exist.** `route()` endpoints register via import side effect, so a definition in a module nothing imports never comes alive — historically the framework's worst failure mode (a plain 404 with no clue). Boot now statically scans the app for `route(method, path)` definitions, diffs them against the live registry (importing `root.tsx` up front so everything reachable has registered), and prints exactly which file defines an endpoint that is NOT live, with the fix.
- **`bractjs dev` auto-restarts on changes it can't absorb in-process** — `app/server.ts`, `lifecycle.ts`, any `*.server.ts`, shared non-route modules, and added/removed route files. The CLI now runs the dev server under a tiny supervisor: the child exits with a reserved code, is respawned, and the browser reloads itself when its HMR socket reconnects. Atomic-save renames (vim, `sed -i`) and editor temp files are recognized and do **not** restart. Programmatic `createDevServer()` gains an `onRestartRequired(file)` option (default: a prominent warning, previous behavior).

### Changed

- **BREAKING: `cssModulesPlugin` and `transformCssModule` are removed from `@bractjs/bractjs/build`.** They are obsolete: Bun scopes `*.module.css` natively and extracts it to a real CSS file, and the framework's plugin actively *prevented* that by intercepting the import via `onLoad` — which is what forced styles to be injected from JS after hydration. Delete them from any custom `Bun.build` plugin list; CSS now needs no plugin at all. Class names are still scoped and still hashed per file, but the hash is Bun's rather than the framework's, so **generated class names change** (they were never a stable API). If you relied on the old runtime `<style>` injection timing, styles now arrive earlier, in the document itself.

### Known limitations

- **CSS Modules do not have server/client class-name parity.** `bractjs dev` and `bractjs start` import route modules from source, and Bun's *runtime* resolves `import styles from "./x.module.css"` to a file-path string rather than the bundler's class-name map — so the server renders no class where the browser renders the scoped one, causing a hydration mismatch and unstyled SSR output for those elements. This is long-standing (the previous `cssModulesPlugin` was a bundler-only plugin and had the same gap); the CSS itself is now correctly extracted and linked, but the class map is not available server-side. **Plain `.css` imports are unaffected and correct in every run mode** — prefer them for anything server-rendered, and reserve CSS Modules for client-only components. Closing this requires the framework to own class-name generation on both sides.

- **Client bundles now strip server-only route exports instead of shipping them.** A new `routeShakePlugin` (exported from `@bractjs/bractjs/build`, applied automatically by `bractjs dev` and `bractjs build`) dead-code-eliminates `loader`, `action`, `headers`, and `middleware` from every route module in the client bundle — including the imports only they used, so a DB driver imported by a loader vanishes from the browser graph entirely instead of being stubbed. Route chunks shrink to their component + client hooks (`beforeLoad`, `clientLoader`, `clientAction` still ship — they run client-side). `serverModuleStubPlugin` remains in the build as the backstop for `*.server.ts` imports that survive shaking. Verified on examples/cms: loader/action-only identifiers (`requirePermission`, `createPost`, `flashRedirect`, …) no longer appear in client chunks except as inert name-only stubs.
- **BREAKING: the package now has three entries, and the root import is app-facing only.** Build plumbing moved to `@bractjs/bractjs/build` (`runBuild`, `runPrerender`, and the bundler plugins `useClientStubPlugin` / `createUseServerProxyPlugin` / `useServerProxyPlugin` / `serverModuleStubPlugin` / `serverOnlyPlugin` / `clientEnvPlugin` / `cssModulesPlugin` / `transformCssModule`); codegen moved to `@bractjs/bractjs/codegen` (`writeModuleRegistries`, `writeManifestModule`, `generateRouteRegistry` / `generateActionRegistry` / `generateManifestModule`, `routesFingerprint`, `explainStaleness`). Update imports by swapping the specifier — signatures are unchanged. Framework internals that were never meant for app code (`collectRouteMiddleware`, `runRouteMiddleware`, `hasForbiddenKey`, `nullProtoFromEntries`, `toastStore`) are no longer exported at all; `toast`, `useToast`, and `useToasts` remain the supported toast API. Everything app code actually uses — hooks, components, `route`, sessions, validation, middleware (`pipeline`, `cors`, `csp`, `authGuard`, `requestLogger`), `createServer` / `createDevServer` / `loadUserConfig` / `defineConfig` — stays importable from `@bractjs/bractjs`.
- **The published type declarations (`types/`) are now generated from source** (`tsc --emitDeclarationOnly`, via `bun run typegen`) instead of hand-maintained. Consumers get the full per-module surface with doc comments — including symbols the hand mirror had historically dropped — and the declaration/runtime drift class of bugs is gone (CI regenerates and fails on any diff). The package entry (`types/index.d.ts`) is unchanged, so existing imports resolve exactly as before.

### Security

- **The open-redirect backstop now covers the whole route-gate pipeline.** `sanitizeRedirect` (the last-line guard that neutralizes an off-origin `Location` not opted in via `redirect(url, …, { allowExternal: true })`) was applied only to redirects thrown/returned by loaders and actions. A redirect `Response` **returned** by `beforeLoad` or by route middleware bypassed it, so a raw off-origin `Location` built from user input in those hooks could be emitted unchecked on both the full-page and `/_data` soft-nav paths. The guard is now applied once around the shared `runRoutePipeline`, covering nested middleware + `beforeLoad` returns alongside the loader/action redirects (idempotent, and unchanged for same-origin or `allowExternal`-branded redirects). Scoped to the SSR route handler on purpose — `/api` handlers and the global middleware pipeline (e.g. an OAuth start route that legitimately redirects off-origin) are not gated.
- **`"use server"` / `"use client"` directive detection is unified** (`src/shared/directives.ts`) across the runtime action registry, the module-registry codegen, and the build plugins — three previously-divergent regexes. The build plugins used a multiline match, so (a) a `"use server"`-looking string at any line start mid-file could wrongly convert an innocent module's exports into fetch proxies, and (b) a real directive preceded by an indented comment could be registered server-side yet ship un-proxied source to the browser. Detection is now anchored to the file's directive prologue (whitespace/comments/BOM tolerated, mid-file matches rejected) everywhere.

### Fixed

- **Post-redirect flash toasts finally fire.** An action redirect (`redirect(to, 303, { "Set-Cookie": flash })` — the classic PRG flash pattern) never popped its toast: `fetch()` follows redirects opaquely, so the browser burned a full document GET it then discarded, and the target layout's `headers()` consumed the one-shot flash cookie before the router's `/_data` request could read it. Client-side action submits (requests carrying `X-BractJS-Action`) now receive the redirect as a `204 No Content` + `X-BractJS-Redirect: <location>` envelope — Set-Cookie and all other headers preserved, Location already vetted by the open-redirect backstop — and the router soft-navigates, making `/_data` the first request to present the cookie. Plain browser form posts (no header) still get the real 3xx. Verified live in examples/cms: "Post created" now toasts after the redirect, and the flash stays strictly one-shot.
- **Type surface reconciled with the runtime API.** `types/index.d.ts` is hand-maintained and had drifted: `serverModuleStubPlugin` (the client-bundle plugin the docs mark as required), `generateRouteRegistry`/`generateActionRegistry`/`generateManifestModule`, `runRouteMiddleware`/`collectRouteMiddleware`, and the i18n helpers (`wrapRoutesWithLocale`, `stripLocale`, `localizedDataPath`) existed at runtime but were invisible to TypeScript consumers; `RouteMiddleware`, `SessionLike`, `RouteDefinition`, `RouteMiddlewareFunction`, `ClientLoaderFunction`, and `ClientActionFunction` types were likewise missing. All are now declared.
- **`ValidationError` is exported as a value.** The barrel exported it type-only while the declarations promised a class, so `err instanceof ValidationError` compiled but threw at runtime.
- **`routesFingerprint` / `explainStaleness` are actually exported.** The 0.2.0 notes announced them but they never reached the public barrel.
- **`StreamFetcherResult` is exported from source** (it was declared in the types but not exported at runtime); its `events` field deprecation now correctly says removal is planned for 0.3.
- **Hydration payload type declares `matches`.** The server has always sent the matched-route chain in `__BRACTJS_DATA__`, but `BractJSClientData` didn't declare it — this also broke `tsc --noEmit` on the framework itself.

- **`DevServer.stop()` actually releases everything.** The dev file watcher was started without keeping its handle, so a stopped programmatic dev server kept watching and rebuilding forever; `watchApp` now returns a closable handle (FSWatcher + pending debounce timer) and `stop()` closes it. A throwing/rejecting watch callback is logged instead of becoming an unhandled rejection.
- **`createDevServer()` no longer calls `process.exit(1)` on a port conflict.** It throws a `DevServerError` (new export of the dev module); the CLI catches it and preserves the friendly message + non-zero exit.
- **Multiple `createServer()` instances no longer clobber each other.** `onShutdown`/`onError` hooks and the signal handlers used module-level slots, so the last server's hooks replaced everyone's and stopping one server disabled every later `stop()`. Live servers are now tracked in a registry: each `stop()` runs its own hook once, and SIGTERM/SIGINT/uncaughtException shut down all of them.
- **Unhandled promise rejections are now logged and routed to `onError`** (process keeps serving; fatal states still arrive via `uncaughtException`). Previously there was no `unhandledRejection` handler at all, so fire-and-forget failures bypassed the lifecycle hooks.
- **Dev: adding or deleting a `"use server"` module now updates the action registry without a restart** (the registry was populated once at boot, so new action files 404'd at `/_action` and deleted ones lingered). Changed action _bodies_ still require a restart. Route-file checks in the dev watcher also handle Windows path separators, and `<appDir>/lifecycle.ts` is resolved through the configured `appDir` instead of a hardcoded `app/`.

### Internal refactors (no behavior change)

- **The server route-gate sequence is single-sourced.** The document branch and the `/_data` soft-nav branch of the request handler each carried their own copy of the security-sensitive pipeline (nested middleware → per-route context → loader args → `beforeLoad`); both now run through one shared `runRoutePipeline`, with only the intentional differences (actions, selective-SSR loader stripping, HTML vs. JSON) remaining per-branch. Parity is pinned by `data-contract.test.ts`.
- **ClientRouter applies `/_data` payloads through one helper.** The loaderData/params/search/meta/matches commit was repeated four times (navigation, SWR refetch, revalidation, SPA hydration) with per-site casts; a shared `applyPayload` + a pure `parseDataPayload` (unit-tested) now guarantee all five fields move together, and route-module introspection goes through one typed `moduleView` instead of scattered `as Record<string, unknown>` casts.

### Tests / tooling

- New `type-surface.test.ts` mechanically asserts every runtime export is declared in `types/*.d.ts` and every declared value exists at runtime — the hand-written declarations can no longer silently drift.
- `pnpm typecheck` (core) now also typechecks the declaration files themselves via `tsconfig.types.json` (`skipLibCheck: false`); they were previously excluded from all typechecking.
- **CI (GitHub Actions)**: lint, workspace typecheck, lockfile-drift check, full test suite (compile-smoke required via `CI_REQUIRE_COMPILE=1`), and an npm-tarball dry-run now gate every push/PR. There was previously no CI at all.
- **ESLint (flat config) + Prettier** are the repo's linter/formatter (`pnpm lint` / `pnpm format`; `pnpm format:check` in CI); `eslint-config-prettier` keeps the two from fighting and `.editorconfig` is populated (it was tracked but empty). The linter is non-type-checked for speed, and the flat config reactivates the `eslint-disable` directives already present in the source.
- `compile-smoke.test.ts` now reports a proper **skip** when `bun build --compile` is unavailable instead of silently passing empty tests, and can be forced to fail in CI.
- **npm tarball no longer ships the test suite** (66 files) — `files` excludes `src/__tests__`; a new `prepublishOnly` gate (`scripts/verify-pack.ts`) asserts LICENSE/README/types/template presence and rejects generated or test files.
- `typescript` is a real devDependency (so `bunx tsc` stops re-resolving it and rewriting `pnpm-lock.yaml` as a side effect) and `@types/bun` is pinned instead of `latest`.
- **Test backfill for previously-untested areas**: the toast store (auto-dismiss, in-place updates, `toast.promise` transitions), the typed `createClient` RPC proxy (URL/method/CSRF-marker/error contract, via a captured fetch), the Cloudflare adapter, and a new `data-contract.test.ts` that pins the **document-vs-`/_data` parity contract** (beforeLoad short-circuit, middleware, `headers()`, 404s must agree across both branches of the request handler).

---

## [0.2.2] — 2026-06-23

### Security

- **Static responses now send `X-Content-Type-Options: nosniff`.** Both hashed client chunks (`/build/client/*`) and `/public/*` assets (including user-uploaded files) carry the header, so browsers can't MIME-sniff a static file into a more dangerous type (e.g. treating an uploaded asset as HTML/JS).

### Types

- The CSP middleware surface — `csp()`, `CspOptions`, `CSP_NONCE_KEY`, `getCspNonce` — is now declared in the public type surface (`types/index.d.ts`). It previously existed at runtime only, so TypeScript consumers couldn't import it without errors.

---

## [0.2.1] — 2026-06-21

### Added

- **Toast notifications** — `<Toaster />` component and `useToast()` hook backed by a shared toast store. Flash messages set by loaders/actions surface as toasts on the next render; `<Form>` integrates with the flash flow after redirects.

### Security

- **Adapter-agnostic catch-all for unhandled request errors.** An uncaught throw from a global middleware or from dispatch itself previously escaped to the adapter — which on Bun leaked `err.message` in production, and on Cloudflare/custom adapters wasn't handled at all. `buildFetchHandler` now catches, logs, fires the `onError` lifecycle hook, and returns a generic 500 (the real message is shown only in explicit dev mode).
- **`BunAdapter`'s last-resort error handler no longer leaks internals.** Its 500 body now returns `"Internal Server Error"` in production; the underlying `err.message` is exposed only in dev, matching the gating used on every other path.

---

## [0.2.0] — 2026-06-16

> **Consolidated notes.** Everything below shipped incrementally across the `0.1.24`–`0.1.29` patch releases and was finalized in `0.2.0` (see the per-tag highlights in the section that follows). `0.2.0` itself also added the published npm README for `@bractjs/bractjs`.

### Security

- **Global middleware now wraps every endpoint, not just SSR documents.** The module-level `pipeline` previously ran only around the SSR route handler, so `cors()`, `csp()`, `authGuard()`, rate limiters, and custom logging attached via `pipeline.use(...)` silently did **not** apply to typed `/api` routes, server actions (`/_action`, `/_stream`), the image endpoint (`/_image`), or static assets. `buildFetchHandler` now runs the pipeline around the entire dispatch, sharing one `context` object; `handleRequest` no longer re-runs it. **This is a behavior change**: a global guard you registered now actually governs your API/asset surface — double-check that middleware you intended as SSR-only isn't doing something surprising on those paths. (`MiddlewarePipeline` gained a `clear()` method.)
- **Typed `/api` routes are CSRF-protected by default.** `handleApiRequest` never enforced CSRF, so an authenticated user's cookies could be used to forge cross-site writes to any mutating `/api` route (a form-encoded body is CORS-"simple" and skips preflight). Mutating routes (`POST`/`PUT`/`PATCH`/`DELETE`) now require the same same-origin proof as server actions (`Sec-Fetch-Site` / `X-BractJS-Action` / matching `Origin`); cross-site requests get `403`. **Opt out** with `route(method, path, handler, { csrf: false })` for deliberately public, credential-free endpoints (webhooks, token-auth APIs). The typed `createClient` now sends `X-BractJS-Action: 1` on mutating calls so same-origin clients keep working even behind proxies that strip `Sec-Fetch-Site`. New export `ApiRouteOptions`.
- **Prototype-pollution defenses are now uniform.** The `__proto__`/`constructor`/`prototype` scan that protected `/_action` JSON bodies is now shared (`src/server/proto-guard.ts`) and also applied to `/api` JSON bodies. Form (`validate()`) and URL search-param (`validateSearch()`/`searchParamsToObject()`) inputs are now built as **null-prototype objects**, so a field literally named `__proto__` can never reach `Object.prototype` when the parsed input is later spread/merged. Signed cookie sessions reject a decoded payload carrying a forbidden key (defense-in-depth). New exports `hasForbiddenKey`, `nullProtoFromEntries`.
- **CSP defaults hardened.** The default policy from `csp()` now includes `form-action 'self'` (an injected `<form>` can only submit same-origin). Documented that `'strict-dynamic'` makes supporting browsers ignore the `'self'`/host expressions in `script-src` (trust flows through the nonce; `'self'` is a fallback for older browsers only).
- **Hard request-body ceiling at the adapter.** The default Bun adapter now sets `maxRequestBodySize` (default 16 MiB, configurable via the new `maxRequestBodySize` config field) as a single backstop above the per-handler caps, so no code path — including an app's own handler that reads `request.formData()` directly — can stream an unbounded body into memory.

### Added — React Router v7 / TanStack parity

- **Route `headers` export** — `export function headers({ loaderData, params, request, parentHeaders })` returns a `HeadersInit` to set `Cache-Control`/`ETag`/`Vary`/CDN headers on the route's **document and `/_data`** responses. Runs in chain order (root → layout → route); innermost wins per key, and each call sees the `parentHeaders` accumulated so far. `Content-Type`/`Transfer-Encoding` stay framework-owned. New exports `HeadersFunction`, `HeadersArgs`.
- **`useMatches()`** — returns the matched route chain (root → layouts → route) as `RouteMatch[]` (`{ id, pathname, params, data, handle }`), for breadcrumbs and conditional chrome driven by each route's `handle` export. SSR-safe; updates on soft navigation and revalidation. `handle` must be JSON-serializable (it travels in the SSR bootstrap + `/_data`). New exports `useMatches`, `RouteMatch`.
- **Route groups `(group)/`** — a parenthesized folder segment groups files (and their `layout.tsx`) **without** adding a URL segment: `routes/(marketing)/about.tsx` → `/about`, wrapped by `routes/(marketing)/layout.tsx`. Layout resolution now derives ancestor dirs from the file path, so a folder's `_index` is also correctly wrapped by that folder's layout.
- **Optional segments `[[id]]`** — `routes/users/[[id]].tsx` matches both `/users` and `/users/42` (param unset when absent). Ranks above catch-all, below a required param / static sibling. Codegen types the route accordingly.
- **Nested route middleware** — `export const middleware = [...]` (a fn or array) runs on the server in chain order (root → layout → route) before `beforeLoad`/action/loaders, with a shared mutable `context`, and can short-circuit by returning a `Response`. Runs _inside_ the global `pipeline`; protects the document **and** `/_data`. The cleaner successor to `beforeLoad` + a single global pipeline (both still supported). New exports `RouteMiddlewareFunction`, `RouteMiddleware`, `runRouteMiddleware`, `collectRouteMiddleware`.
- **`clientLoader` / `clientAction`** — RR7-style browser-side data. `clientLoader({ request, params, search, serverLoader })` runs on navigation and its result becomes `useLoaderData()`; set `clientLoader.hydrate = true` to also run on the initial hydration of an SSR'd document. `clientAction({ request, params, formData, serverAction })` runs on `<Form>`/fetcher submit and decides whether/how to hit the server. New exports `ClientLoaderFunction`, `ClientActionFunction`.

### Added — Developer experience

- **`useLoaderData<typeof loader>()` / `useActionData<typeof action>()`** — pass the loader/action FUNCTION type and the data type is inferred from its return (awaited, `Response` branch excluded, `Deferred` fields preserved). No more hand-written `LoaderData` aliases. The object form (`useLoaderData<HomeData>()`) still works. New exported helper types `LoaderData<T>` / `ActionData<T>`; `<Await resolve>` now also accepts a `Deferred<T>`.
- **`LoaderArgs<TSearch>` / `ActionArgs<TSearch>`** — parameterize to drop the `search as X` cast: `loader({ search }: LoaderArgs<BoardSearch>)`. Codegen also emits `LoaderArgsFor<"/posts">` / `ActionArgsFor<"/posts">` for the full route-literal arg shape (params + context + validated search).
- **Auto-codegen in dev** — `bractjs dev` regenerates `route-types.gen.ts` on boot and whenever a route file is added/removed/renamed; `bractjs new` runs it on scaffold. The generated file is now deterministic (route-sorted) and carries a `// bractjs:routes <hash>` fingerprint; `writeRouteTypes` skips identical writes (no editor reload loops) and returns `{ dest, written }`. New exports `routesFingerprint`, `explainStaleness`.
- **`safeValidate(schema, input)`** — non-throwing validation returning `{ ok: true, data } | { ok: false, fieldErrors, firstError }` — the ergonomic action idiom. Plus `isValidationResponse(err)` and `readValidationError(res)` for the try/catch style, and `formText` / `formValues` FormData helpers.
- **`defineActions({ ... })` + `<Form intent="...">`** — compose one route action from per-intent handlers (dispatch on the form's `intent` field; unknown intent → 400 listing the known ones in dev). `<Form>` / `<fetcher.Form>` gained an `intent` prop that renders the matching hidden input.
- **`defineConfig()`** — identity helper for `bractjs.config.ts` (autocomplete + type-checking without annotating the full type). `hmrPort` is now a config field (and threaded to the HMR client, which previously hardcoded `3001`).
- **Dev failure-mode DX** — boot prints a route table (pattern ← file, loader/action markers) + the HMR port; route modules are statically linted (warns on a route with no `default`/`loader`/`action`/`beforeLoad`, and on miscased exports like `Loader`/`fallback`); loader/action errors name the failing route file (in the log and the dev error overlay, which now has a producer); CSRF 403s explain the fix in dev (terse in prod); a port already in use prints a friendly message pointing at `port`/`hmrPort`.

### Repository

- **Converted to a pnpm workspace monorepo (no consumer impact).** The framework now lives in `packages/core` and is published unchanged as `@bractjs/bractjs` — same name, `exports`, types, and the `bractjs` CLI bin. The published tarball is identical in shape, so `bun add @bractjs/bractjs` / `bunx bractjs new` and every `import "@bractjs/bractjs"` work exactly as before; **existing users need to do nothing**. Internally: `src/`, `bin/`, `types/`, and `templates/` moved under `packages/core/`; the example apps under `examples/*` are now workspace packages linked via `workspace:*` instead of `file:../..`; **pnpm** manages dependencies (`pnpm-lock.yaml` is the source of truth, replacing `bun.lock`), while **Bun** remains the runtime, test runner, and bundler. Contributors now run `pnpm install` at the repo root.

### Deprecated

- **`StreamFetcherResult.events`** — never emitted; use `connect(actionId)`. Removal planned for 0.3.

### Added

- **`useLocation()` + `RouterLocation`** — reactive `{ pathname, search, hash, state, key }`; SSR-safe (request-derived on the server). History entries are now stamped with a stable `key`, and `navigate`/`<Link>` accept `replace` and `state` options.
- **`<ScrollRestoration />`** — restores scroll position on back/forward and reload, scrolls to top (or the `#hash` element) on new navigations. Positions persist in sessionStorage (LRU-capped). Opt-in via `root.tsx`.
- **Link prefetch modes** — `prefetch="intent" | "viewport" | "render"` join `"hover"`. Prefetching now actually warms the loader cache (under the exact key the router computes, with a ≥30s freshness window) instead of issuing a discarded fetch; data prefetches are de-duplicated and capped at 6 concurrent; `"viewport"` uses one shared IntersectionObserver.
- **Typed, validated search params** — routes export `searchSchema` (Zod/Valibot/anything with `parse`/`safeParse`); the server validates/coerces before anything else runs (failure → 400; per-field leniency via `.catch()`). Loaders receive the output as `args.search`; the client reads it with `useSearch()` (validated object, numbers stay numbers — never re-validated client-side) and writes with `useSetSearch()` (functional patch → URL → soft-nav). `<Link>`/`useNavigate` accept a typed `search` option. `bractjs codegen` infers each route's search type from its schema (`Register.routes.searchOutput`), making the whole flow end-to-end typed. New exports: `useSearch`, `useSetSearch`, `validateSearch`, `searchParamsToObject`, `serializeSearch`, `SearchOutputFor`, `InferSchemaOutput`.
- **`useRevalidator()`** — manual loader revalidation (`{ revalidate, state }`) for refresh buttons/polling/out-of-band updates.
- **`shouldRevalidate` route export** — veto the SWR background refetch and post-mutation revalidation per route.
- **Fetcher overhaul for optimistic UI** — fetchers now live in a shared store: `useFetcher({ key })` gives a fetcher a stable cross-component identity; results expose `formData`/`formMethod` from the moment `submit()` is called (the optimistic-UI source) plus a scoped `<fetcher.Form>`; new `useFetchers()` returns every active fetcher. Fetcher submits now auto-revalidate the active route's loaders, and a successful mutation clears the loader cache.
- **Selective SSR** — per-route `export const ssr = false | "data-only"` with a `Fallback` component (HydrateFallback equivalent): `"data-only"` runs loaders on the server but renders the component client-only; `false` also skips the route loader during document SSR (the client completes via `/_data`). `beforeLoad` always runs server-side — not an auth bypass.
- **SPA mode** — `ssr: false` in `bractjs.config.ts` serves one static shell for every document GET ("no document SSR", not "no server": loaders, actions + CSRF, images, API routes all keep working). `bractjs build` emits `build/client/__spa.html`; dev renders the shell on the fly.
- **Prerendering (SSG)** — `prerender: ["/", "/about"]` (or a function) in config; `bractjs build` runs real loaders in-process and writes HTML + `/_data` payloads under `build/client/_prerender/`; production serves them for clean URLs before dynamic SSR (query strings stay dynamic). Exported as `runPrerender()`.
- **`serverModuleStubPlugin`** (client bundle) — replaces every export of a `*.server.ts` module with an inert, throwing stub instead of hard-failing the build.
  - BractJS ships the _entire_ route module (loader + action included) to the client, so a route that does `import { db } from "./db.server.ts"` inside its loader pulls the server module into the client graph. The previous `serverOnlyPlugin` hard-failed that import, which made the documented "import a server module in a loader" pattern (README §17) impossible.
  - Stubbing keeps named/default imports resolvable so the route module compiles, guarantees **zero** server source (DB drivers, secrets, `bun:sqlite`) reaches the browser, and throws a clear error if a stub is ever actually invoked on the client.
  - Now used by the production build (`src/build/bundler.ts`), the dev rebuilder (`src/dev/rebuilder.ts`), and the dev HMR per-module handler (`src/dev/hmr-module-handler.ts`).
  - Exported from the public API; `extractExports` is now exported from `src/build/directives.ts` for reuse.
  - The stricter `serverOnlyPlugin` remains exported for opt-in use when you want a `*.server.ts` import to be a build error.

### Fixed

- **Soft navigation no longer wipes the document head.** The `/_data` payload now carries the route's merged `meta` (ClientRouter always read `data.meta` but the server never sent it, so every soft-nav reset title/description to nothing). Cached SWR commits update meta too.
- **`useNavigation()` can actually reach `"submitting"`.** `NavigationContext.submit` was a dead stub and `<Form>` bypassed it; `<Form>` now submits through the router, driving `"submitting"` → `"loading"` (revalidation) → `"idle"`.
- **`RouterContext.pathname` is always query-free.** Soft navigations previously stored `"/admin?x=1"` as the pathname; `location` is now the single source of truth and `pathname` derives from it. `<Form>` posts to `pathname + search` consistently.
- **Navigation no longer leaks the previous page's query string into the next page's loader fetch** (`navigate("/b")` from `/a?x=1` used to request `/_data?path=/b?x=1`).
- **`safeStringify` only flags true cycles.** A shared (non-cyclic) reference — e.g. a loader echoing `args.search` — was serialized as `"[Circular]"`, corrupting `__BRACTJS_DATA__`. Cycle detection now tracks the ancestor chain (MDN replacer pattern).
- **SECURITY: dev client builds now apply the same guard plugins as production.** `src/dev/rebuilder.ts` was missing `serverOnlyPlugin`/`clientEnvPlugin` entirely — a route importing a `*.server.ts` module (without a Bun builtin to trip the bundler) would have had that server source compiled and served to the browser over `/build/client` in dev, and `clientEnv` allow-listing was not applied. The rebuilder now runs `serverModuleStubPlugin`, `createUseServerProxyPlugin`, `clientEnvPlugin`, and `cssModulesPlugin`, matching `src/build/bundler.ts`.
- A `*.server.ts` import that pulled in a Bun builtin (e.g. `bun:sqlite`) previously surfaced a confusing raw `Browser build cannot import Bun builtin` error in dev instead of the intended server-only guard. It now stubs cleanly.
- **An action that _returns_ a redirect now produces a real 3xx.** Previously only a _thrown_ `redirect()` was honored; `return redirect("/")` (the documented pattern in README §5/§6/§15) was captured as `actionData` and wrapped into a `200` JSON body. The route handler (`src/server/request-handler.ts`) now propagates any `Response` an action returns — so the browser and `<Form>` see the 302 and follow it. Surfaced by manual (Playwright) testing of the todo example's "delete → redirect to board" flow.
- **`<Form>` now normalizes the post-redirect URL to a path before soft-navigating.** After following a redirect, `fetch().url` is absolute (e.g. `http://localhost:3000/`); the client router matches route patterns against a pathname, so the absolute URL produced a `/_data?path=http%3A%2F%2F…` 404 and the navigation silently failed. `src/client/components/Form.tsx` now converts a same-origin absolute redirect URL to `pathname + search + hash`.

### Tests

- `src/__tests__/server-module-stub.test.ts` — proves a route importing a `bun:sqlite`-backed `*.server.ts` builds, that no server source/secret/SQL reaches the client output, that named + default exports stay resolvable, that the stub throws when invoked, and that the legacy `serverOnlyPlugin` still hard-fails the same import.
- `src/__tests__/integration.test.ts` — added regression tests asserting that a route action which _returns_ `redirect()` yields a `302` + `Location` for both the `X-BractJS-Action` (`<Form>`) and full-page POST paths (fixture: `routes/redirect-action.tsx`); plus `/_data` now carrying merged `meta`.
- New suites for this release: `nav-utils.test.ts` (parseTo/location keys), `scroll-restoration.test.ts`, `search-validation.test.ts` (unit + live-server searchSchema coercion/400s), `search-serializer.test.ts`, `fetcher-store.test.ts`, `revalidation.test.ts` (mutation → revalidate contract), `selective-ssr.test.ts` (Fallback SSR, loader skipping, beforeLoad parity), `spa-mode.test.ts` (shell serving + CSRF intact), `prerender.test.ts` (generation + production file serving). `typed-routing.test.ts` extended with `useSearch`/`useSetSearch`/`<Link search>` type-level assertions.

---

## [0.1.24 – 0.1.29] — 2026-05-20 → 2026-06-14

Incremental patch releases; their changes are consolidated into the `[0.2.0]` notes above. Highlights per tag:

- **0.1.24** — deferred framework source resolution until plugin execution.
- **0.1.25** — concurrent loader execution; `bun build --compile` safety + smoke tests; `*.server.ts` stubbed in client bundles instead of hard-failing; action-returned redirects honored; CSS modules support + client-side React deduplication.
- **0.1.26** — docs: README requirements + changelog section.
- **0.1.27** — end-to-end typed routing (typed `Link` / `useNavigate` / `useParams`); typed, validated search params with serialization.
- **0.1.28** — security-model hardening: CSRF protection, validation handling, CSP configuration.
- **0.1.29** — per-route middleware + `headers` export; prototype-pollution guards; converted to a pnpm workspace monorepo; `new-app` template package.

---

## [0.1.23] — 2026-05-20

### Added

- **Native `bun build --compile` support** — package a BractJS app as a single executable
  - Module-registry codegen (`bractjs codegen:registry`) writes static `import` statements for every route, layout, root, and `"use server"` module into `app/_generated/{routes,actions}.ts` so Bun's bundler can trace them
  - Manifest codegen (`bractjs codegen:manifest`) snapshots `build/route-manifest.json` into `app/_generated/manifest.ts` as an inline `ServerManifest` constant — no disk read at startup
  - `bractjs compile [outfile]` runs the full pipeline (registry codegen → build → manifest codegen → `bun build --compile`)
  - `BractJSConfig` accepts `routeFiles`, `moduleRegistry`, `actionModules` — when all are present, the server boots with zero `Bun.Glob` scans and zero dynamic `import(absPath)` calls
  - `resolveRouteChain` has a registry-aware code path that looks modules up by appDir-relative key instead of dynamic import
  - `loadServerActionsFromRegistry()` companion to `loadServerActions()` — registers pre-imported action modules
  - `serveStatic` falls back to `Bun.file()` when `realpath()` throws (embedded virtual paths in compiled binaries); the structural traversal guard still runs first
- **Stable server-action IDs** — `computeId` (server) and `actionId` (client proxy plugin) now hash the appDir-relative path instead of the absolute path
  - IDs stay consistent across CI / build machine / production server / compiled binary; previously a path difference produced silent `/_action?id=...` 404s
  - `useServerProxyPlugin` becomes a factory: `createUseServerProxyPlugin(appDir)`. The constant export remains for backwards compatibility (legacy absolute-path mode)
- **Build plugins exported from the public API** — required when composing a custom `Bun.build()` (e.g. for the single-binary workflow)
  - `useClientStubPlugin` (server bundle)
  - `createUseServerProxyPlugin(appDir)` (client bundle)
  - `serverOnlyPlugin` (client bundle)
  - `clientEnvPlugin(allowedKeys, env)` (client bundle)
  - `cssModulesPlugin` was already exported
  - **SECURITY:** missing `createUseServerProxyPlugin` on a custom client build ships server-action bodies (DB queries, secrets) inside the browser JS
- **`RouteFile`, `Segment`, `ModuleRegistry` types** added to the public API
- **`app/server.ts`** template entry added to the scaffold (`bractjs new`)
- **Server lifecycle hooks** — `onStart` and `onShutdown` callbacks on `BractJSConfig`
  - `onStart` runs once after the server begins accepting requests (DB connect, cache warm-up, etc.)
  - `onShutdown` runs before process exit — handles `SIGTERM`, `SIGINT`, `SIGUSR2`, `beforeExit`, and `uncaughtException` so connections are always closed
  - Signal handlers are registered once (module-level guard) — safe across HMR restarts
  - `gracefulShutdown` is idempotent — multi-signal storms do not double-invoke `onShutdown`
- **`defineLifecycle(hooks)`** — typed helper for declaring lifecycle hooks in `app/lifecycle.ts`
  - `LifecycleHooks` interface exported from the public API
- Dev server auto-loads `app/lifecycle.ts` (default export) if present

### Changed

- `resolveRouteChain` now accepts an optional `registry` parameter; dev-mode behavior (dynamic import) is preserved when omitted
- `HandlerConfig` gains a `moduleRegistry` field threaded through the request pipeline
- `safeRealpath` in `src/server/static.ts` now falls back to a direct existence check when `realpath()` throws — required for `bun build --compile --asset` embedded paths; the structural `startsWith(root + sep)` traversal guard runs unconditionally before any I/O
- **`createServer().stop()` no longer calls `process.exit()`** — previously, `stop()` triggered an immediate process termination via `gracefulShutdown → process.exit(0)`. This made the server impossible to use inside a Bun test or any parent process that wanted to keep running after stopping a listener. The new contract: `stop()` runs the user's `onShutdown` hook, closes the adapter, and returns. Signal handlers (`SIGTERM`/`SIGINT`/`SIGUSR2`/`uncaughtException`) keep their explicit `process.exit()` because termination is the intent there. **Migration:** if you previously relied on `srv.stop()` to terminate the process, call `process.exit(0)` yourself afterwards.
- `process.on("beforeExit")` handler no longer calls `process.exit()` either — `beforeExit` fires when the event loop is naturally draining; re-entering the exit path from inside it caused test runners to hang forever waiting for a clean exit code. Now it just runs the shutdown hook and stops the listener.

### Fixed

- `bun test` no longer hangs when a test creates and stops a server (`src/__tests__/security.test.ts`, `src/__tests__/integration.test.ts`). Root cause was the `beforeExit` / `stop()` calls into `process.exit(0)` (see Changed above). Full test suite now runs end-to-end: 225 tests across 23 files.
- TypeScript: `src/client/ClientRouter.tsx` dynamic import of the dev-only DevTools panel (`"/_bractjs/devtools.js"`, a runtime URL served by `serve.ts`) is now annotated with `// @ts-expect-error TS2307` and an explanatory comment. The path can't be resolved at compile time but is intentional at runtime — the `.catch()` swallows the import failure in production.

### Scaffold

- `bractjs new` now seeds `app/_generated/{routes,actions,manifest}.ts` immediately after `bun install` so the scaffolded `app/server.ts` typechecks before the user runs a build. The manifest stub is a placeholder — replaced by `bractjs codegen:manifest` after the first `bractjs build`.
- New `templates/new-app/.gitignore` covers `app/_generated/`, `build/`, `node_modules/`, `.bract-image-cache/`, and standard env files.
- Repo `.gitignore`: added `app/_generated/` and `src/__tests__/.tmp-*` so codegen output and test fixture leaks don't get committed.

---

## [0.1.0] — 2026-05-11

### Added

#### Core SSR

- `createServer()` — `Bun.serve()` entry with streaming SSR via `renderToReadableStream`
- File-based routing via `Bun.Glob` with `scanRoutes()`
- Route trie matcher (static > param > catch-all priority, no regex)
- Layout chain resolution (`root.tsx → routes/**/layout.tsx → route`)
- Parallel loader execution (`Promise.all`) with error isolation
- Action handler for `POST` / `PUT` / `DELETE`
- `/_data?path=` JSON endpoint for soft-nav data fetching
- `redirect()`, `json()`, `error()` response helpers
- `meta()` resolution — full merge + dedup (last-writer-wins), SSR-injected into `<head>`

#### Streaming

- `defer()` helper — returns resolved values immediately, streams promises
- `<Await>` component — React 19 `use()` + `<Suspense>` for deferred data

#### Client

- `hydrateRoot()` browser entry with `window.__BRACTJS_DATA__` hydration
- `ClientRouter` — `RouterContext` + `NavigationContext` with `startTransition`
- `<Link>` — soft navigation, `prefetch="hover"` (chunk + data preload)
- `<Form>` — fetch-based submission, auto loader reload
- `<Outlet>` — `React.lazy()` route rendering with `RouteErrorBoundary`
- `useLoaderData<T>()`, `useActionData<T>()`, `useParams()`, `useNavigation()`
- `useFetcher()` — independent background fetch/submit
- Browser back/forward support (`popstate` listener)

#### Dev Experience

- File watcher via `node:fs watch` with 50ms debounce
- HMR WebSocket server (port 3001) + auto-reload browser client
- Dev error overlay — full-screen stack trace injected into HTML
- `DefaultErrorBoundary` (stack in dev, generic message in prod)
- `RouteErrorBoundary` class component

#### Build System

- Dual `Bun.build()` — server bundle (`target: "bun"`) + client bundle (`target: "browser"`)
- Route code splitting — one chunk per route file
- Content-hash filenames (`SHA-256`, 8-char prefix) for cache busting
- `build/route-manifest.json` — maps URL patterns to hashed chunk paths
- `.server.ts` import guard plugin — build error if server file imported in client
- `clientEnv` allowlist — `process.env.*` define-stripping at build time
- `Cache-Control: public, max-age=31536000, immutable` for hashed client assets
- `Cache-Control: no-cache` for `public/` assets

#### Middleware

- `MiddlewarePipeline` — composable `use()` + `run()` with full context threading
- `requestLogger()` — `[METHOD] /path → status in Xms`
- `cors({ origin, methods? })` — `Access-Control-Allow-*` headers + OPTIONS preflight
- `authGuard({ session, required? })` — cookie session → `ctx.context.user`

#### Session

- `createCookieSession()` — HMAC-SHA256 signing via `crypto.subtle`
- Base64url encode/decode, constant-time signature verification
- Secret rotation support (`secrets: [current, ...previous]`)
- `Set-Cookie` builder with `HttpOnly`, `Secure`, `SameSite`, `Max-Age`, `Path=/`

#### TypeScript

- Full declaration files under `types/` — `route.d.ts`, `config.d.ts`, `session.d.ts`, `middleware.d.ts`, `index.d.ts`
- `package.json` conditional exports with `"types"` field

#### CLI

- `bractjs new <name>` — scaffold a new app from `templates/new-app/`
- `bractjs dev` — starts dev server + HMR
- `bractjs build` — production build
- `bractjs start` — production server
