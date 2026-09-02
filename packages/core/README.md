# BractJS

[![npm version](https://img.shields.io/npm/v/@bractjs/bractjs)](https://www.npmjs.com/package/@bractjs/bractjs)
[![license](https://img.shields.io/npm/l/@bractjs/bractjs)](https://github.com/bractjs/bractjs/blob/main/LICENSE)

> Production-grade SSR framework for **Bun + React 19**.
> File-based routing · Parallel loaders · Streaming SSR · Built-in HMR · Server Actions · Typed routes · Single-binary deploy.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 — no Node.js support
- React 19 (peer dependency)

## Quickstart

```sh
# Scaffold a new app
bunx @bractjs/bractjs new my-app
cd my-app

# Start the dev server (HMR on http://localhost:3000)
bun run dev
```

Or add it to an existing project:

```sh
bun add @bractjs/bractjs react react-dom
```

`react` and `react-dom` v19 are **peer dependencies** — BractJS ships zero other runtime deps.

## Highlights

- **File-based routing** — params (`[id]`), optional segments (`[[id]]`), catch-alls, route groups (`(group)/`), nested layouts.
- **Loaders & actions** — parallel loader execution, streaming `defer()`, `<Await>`, typed `useLoaderData<typeof loader>()`.
- **Server Actions** (`"use server"`) and typed `/api` routes (`route()` + `createClient`) with CSRF protection by default.
- **Middleware** — global pipeline (`cors`, `csp`, `authGuard`, `requestLogger`) plus per-route nested middleware.
- **Client runtime** — soft navigation, prefetching, fetchers with optimistic UI, `<Toaster>`, scroll restoration.
- **Selective SSR, SPA mode, and prerendering (SSG)** per route or app-wide.
- **Single-binary deploy** — `bractjs compile` packages your app with `bun build --compile`.

## Documentation

The full step-by-step guide to every export lives in the repository:

- **[Full documentation (README)](https://github.com/bractjs/bractjs#readme)**
- [Changelog](https://github.com/bractjs/bractjs/blob/main/CHANGELOG.md)
- [Roadmap](https://github.com/bractjs/bractjs/blob/main/ROADMAP.md)
- [Contributing](https://github.com/bractjs/bractjs/blob/main/CONTRIBUTING.md)
- [License (MIT)](https://github.com/bractjs/bractjs/blob/main/LICENSE)

## CLI

```
bractjs new <name>     Scaffold a new app
bractjs dev            Dev server with HMR
bractjs build          Production build
bractjs start          Production server
bractjs codegen        Generate typed-route definitions
bractjs compile        Single-binary build (bun build --compile)
```
