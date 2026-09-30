# BractJS — Roadmap

> An SSR framework for Bun + React 19. This file tracks direction; [`CHANGELOG.md`](CHANGELOG.md) is the
> detailed record of what shipped and when.

---

## Next

Open work, roughly in priority order.

- [x] **Root/layout loader errors render an `ErrorBoundary`** (unreleased)
- [x] **CSS Modules server/client class-name parity** (unreleased)
- [ ] **Browser end-to-end tests in CI** — hydration, soft navigation, forms and error pages checked in a real browser against `examples/todo`.
- [ ] **React Router–style root `Layout` export** — lets root's `ErrorBoundary` render inside the app's own document when the root loader fails.
- [ ] **`clientMiddleware`** — the last React Router 8 route export BractJS ignores (the route linter warns about it).
- [ ] **Built-in i18n as a one-line opt-in** — locale-prefix helpers exist (`wrapRoutesWithLocale`, `stripLocale`, `useLocale`, `useLocalizedLink`) but aren't wired into core routing end-to-end.
- [ ] **Prerender output embedded in the compiled binary** — today `build/client/` ships alongside it, or via `--asset`.
- [ ] **Deno / Node.js adapters** — validate the `BractAdapter` contract beyond Bun and Cloudflare Workers. Lowest priority: the build pipeline is `Bun.build`, so this is runtime portability only.

---

## Shipped

One line per release; see the changelog for everything else.

| Version | Date         | Headline                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.6.0   | 2026-09-29   | React Router 8 features (typed `createContext`, instrumentation, `fetcher.reset`, `defaultShouldRevalidate`, `streamTimeout`) and a React Router 7/8 API-compatibility layer (`data()`, `useSubmit`, `useRouteError`, `NavLink`, `links`, `HydrateFallback`, cookie session storage, …)                                                                                                                                                                               |
| 0.5.0   | 2026-09-28   | Response compression, `getRequest()` for server actions, `layout.tsx` components actually render, `defer()`/`<Await>` hydration fix, route-loader `HttpError` renders the `ErrorBoundary`, 37–47% smaller client bundles, benchmarks, Remix/React Router porting guide                                                                                                                                                                                                |
| 0.4.1   | 2026-09-27   | `bractjs new` scaffolds a working app again                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 0.4.0   | 2026-09-27   | Zero-config CSS pipeline (extracted, hashed, `<link>`-injected), `tailwind: true`, CSS hot-swap, generated `types/`, `app/server.ts` + `lifecycle.ts` in every run mode, live loader/action edits and dev auto-restart, per-endpoint `/api` middleware, security audit fixes                                                                                                                                                                                          |
| 0.3.x   | 2026-07      | Unified directive detection, type-surface reconciliation, `createDevServer()` hardening, `bractjs codegen:seed`                                                                                                                                                                                                                                                                                                                                                       |
| 0.2.x   | 2026-06      | pnpm monorepo, toasts (`<Toaster />`, `useToast()`, flash integration), CSP middleware, static-response hardening                                                                                                                                                                                                                                                                                                                                                     |
| 0.1.x   | 2026-05 → 06 | The core framework: file-based routing, streaming SSR, loaders/actions, client router and hydration, dev server with HMR, build + manifest, middleware, sessions, typed routes, `"use server"`/`"use client"`, streaming fetchers, Cloudflare Workers adapter, image optimization, validated search params, selective SSR, SPA mode, prerendering, route groups, optional segments, nested middleware, `clientLoader`/`clientAction`, single-binary `bractjs compile` |
