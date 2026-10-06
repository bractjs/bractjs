# BractJS — Roadmap

> An SSR framework for Bun + React 19. This file tracks direction; [`CHANGELOG.md`](CHANGELOG.md) is the
> detailed record of what shipped and when.

---

## Next

Open work for 0.8.0, roughly in priority order.

- [x] **Route middleware runs for `"use server"` actions** (a route's auth guard can't be bypassed through its actions)
- [x] **The page for a failed root loader hydrates**, so links work and the app recovers
- [x] **`viewTransition` on `navigate()`, `<Form>` and `submit()`**, and a fixed `<Link viewTransition>`
- [x] **`cache()` Cache-Control helpers**, with a `private` safety net for responses that set cookies
- [x] **Typed, validated environment** (`defineEnv`), checked at startup in every run mode
- [x] **`bractjs routes` and `bractjs doctor`**
- [ ] **Dev error overlay**: code frames, open-in-editor, client runtime errors
- [ ] **ISR for prerendered pages** (`revalidate`, `revalidatePath()`)
- [ ] **Sitemap and robots.txt** from the route table, prerender paths and locales
- [ ] **OpenTelemetry preset** on top of `instrument()`
- [ ] **AWS Lambda adapter**; Vercel and Netlify recipes
- [ ] **WebSockets for app code** (Bun and Deno)
- [ ] **MDX routes** (opt-in)

---

## Shipped

One line per release; see the changelog for everything else.

| Version | Date         | Headline                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.7.1   | 2026-10-02   | `/_image` on Node.js and Deno, a Deno request-body cap, compression backpressure, i18n `//` path fix                                                                                                                                                                                                                                                                                                                                                                  |
| 0.7.0   | 2026-10-02   | Production servers on Node.js and Deno, self-contained `bractjs compile` binary, i18n, `clientMiddleware`, root `Layout` export and in-app 404s, typed loader data by route id, `@bractjs/bractjs/testing`, production middleware (rate limiting, request ids, health checks, secure headers), server-side sessions, React 19 form actions                                                                                                                            |
| 0.6.0   | 2026-09-29   | React Router 8 features (typed `createContext`, instrumentation, `fetcher.reset`, `defaultShouldRevalidate`, `streamTimeout`) and a React Router 7/8 API-compatibility layer (`data()`, `useSubmit`, `useRouteError`, `NavLink`, `links`, `HydrateFallback`, cookie session storage, …)                                                                                                                                                                               |
| 0.5.0   | 2026-09-28   | Response compression, `getRequest()` for server actions, `layout.tsx` components actually render, `defer()`/`<Await>` hydration fix, route-loader `HttpError` renders the `ErrorBoundary`, 37–47% smaller client bundles, benchmarks, Remix/React Router porting guide                                                                                                                                                                                                |
| 0.4.1   | 2026-09-27   | `bractjs new` scaffolds a working app again                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 0.4.0   | 2026-09-27   | Zero-config CSS pipeline (extracted, hashed, `<link>`-injected), `tailwind: true`, CSS hot-swap, generated `types/`, `app/server.ts` + `lifecycle.ts` in every run mode, live loader/action edits and dev auto-restart, per-endpoint `/api` middleware, security audit fixes                                                                                                                                                                                          |
| 0.3.x   | 2026-07      | Unified directive detection, type-surface reconciliation, `createDevServer()` hardening, `bractjs codegen:seed`                                                                                                                                                                                                                                                                                                                                                       |
| 0.2.x   | 2026-06      | pnpm monorepo, toasts (`<Toaster />`, `useToast()`, flash integration), CSP middleware, static-response hardening                                                                                                                                                                                                                                                                                                                                                     |
| 0.1.x   | 2026-05 → 06 | The core framework: file-based routing, streaming SSR, loaders/actions, client router and hydration, dev server with HMR, build + manifest, middleware, sessions, typed routes, `"use server"`/`"use client"`, streaming fetchers, Cloudflare Workers adapter, image optimization, validated search params, selective SSR, SPA mode, prerendering, route groups, optional segments, nested middleware, `clientLoader`/`clientAction`, single-binary `bractjs compile` |
