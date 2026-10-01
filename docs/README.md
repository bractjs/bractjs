# BractJS Documentation

The [root README](../README.md) is the **complete API reference** — every export, ordered from "first app" to "advanced". The guides here are the **learning path**: they teach the mental model and the end-to-end workflows the reference assumes you already have.

## Start here

| Guide                                                 | What it covers                                                                                                                                 | Read it when                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Tutorial: your first app](tutorial.md)               | Scaffold → routes → loaders → forms with validation → a typed API endpoint → a single-binary build, in ~15 minutes.                            | You're new to BractJS.                                             |
| [Concepts: how BractJS works](concepts.md)            | The request lifecycle, the three run modes, what ships to the client, and how dev-mode change handling behaves.                                | You want the mental model before (or after) the tutorial.          |
| [Authentication end to end](authentication.md)        | Sessions, gating routes, guarding `/api` and server actions, CSRF — and the scoping rules that make or break an auth setup.                    | You're adding login to an app. **Read this before shipping auth.** |
| [Running in production](production.md)                | Request ids and JSON logs, health checks, security headers, rate limiting, server-side sessions, and a container recipe.                       | You're preparing an app for real traffic.                          |
| [Testing your app](testing.md)                        | `bun test` with `@bractjs/bractjs/testing`: whole requests through the real pipeline, single loaders/actions, server actions, auth flows.      | You're writing tests for an app.                                   |
| [Deployment](deployment.md)                           | `build`/`start`, the single-binary pipeline, rendering modes (SSR / SPA / prerender), and a production checklist.                              | You're taking an app to production.                                |
| [Migrating from Remix / RR7](migrating-from-remix.md) | File-name mapping, API and hook differences, sessions, middleware scope, resource routes, known gaps, and a porting checklist.                 | You have an existing Remix or React Router 7 app.                  |
| [Benchmarks](benchmarks.md)                           | BractJS vs React Router 7 vs Next.js on one identical page: throughput, latency, JS weight, memory, cold start — with methodology and caveats. | You're evaluating BractJS's performance claims.                    |

## Suggested reading order

- **New to BractJS** — [Tutorial](tutorial.md) → [Concepts](concepts.md) → the [README reference](../README.md) as needed → [Authentication](authentication.md) when you add login → [Deployment](deployment.md) when you ship.
- **Coming from Remix / React Router 7** — the route module API (`loader`/`action`/`meta`/`ErrorBoundary`) will feel familiar. Work through [Migrating from Remix / RR7](migrating-from-remix.md) — it maps file names, imports, hooks, and sessions and lists what has no equivalent — with [Concepts](concepts.md) open for the middleware scoping rules.
- **Evaluating BractJS** — [Concepts](concepts.md) + the reference's [security model (§27)](../README.md#27-security-model) give the fastest honest picture, and [`examples/cms`](../examples/cms/) shows a full production-shaped app (auth + 2FA + OAuth + SQLite).

## Working examples

| Example                              | Scope                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [`examples/todo`](../examples/todo/) | Minimal — routes, loaders, actions. Port 3000.                                                                         |
| [`examples/cms`](../examples/cms/)   | Full app — password + email-OTP 2FA, Google/Microsoft OAuth, RBAC, Tailwind v4, SQLite, its own test suite. Port 3200. |

## Contributing to these docs

Guides live here; the API reference lives in the root README. When a feature changes, update the reference first — guides should link to reference sections (e.g. [§14 Middleware](../README.md#14-middleware)) rather than restating parameter lists, so there's one place that must be correct.
