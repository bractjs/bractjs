# Deployment

BractJS has one production build and three ways to run it: the classic `build` + `start` pair, a single compiled executable, and embedding into your own server. This guide covers each, the rendering modes that change what gets deployed, and a production checklist.

## The classic path: `build` + `start`

```sh
bractjs build     # server + client bundles, content-hashed assets, manifest → build/
bractjs start     # serve it
```

Deploy the project directory (with `build/` and `node_modules`) to any machine with Bun, run `bractjs start` under your process manager, set `PORT` as needed. This is the path to start with — it's the least magic, and everything in the next section is an optimization on top of it.

## The single binary: `bractjs compile`

The headline deployment story — your whole app as one executable:

```sh
bractjs compile ./myapp
./myapp
```

Copy one file to a server (or a `FROM scratch`-style container) and run it. No `node_modules`, no `app/` directory, no Bun installation on the target — the runtime is inside the binary.

### How it works

`bun build --compile` can't trace runtime filesystem scans or dynamic imports, so a codegen step first materializes everything dynamic into static code. `bractjs compile` is exactly this sequence:

```sh
bractjs codegen:registry     # A — scan routes/actions → static import tables (app/_generated/)
bractjs build                # B — client + server bundles + asset manifest
bractjs codegen:manifest     # C — snapshot the manifest as a TS constant
bun build --compile app/server.ts --asset build/client/ --outfile ./myapp   # D
```

The binary boots with **zero filesystem reads of `app/`**. `--asset build/client/` embeds the JS/CSS into the executable (a true single file); omit it to ship the binary with `build/client/` alongside instead. ([§22](../README.md#22-single-binary-deployment))

### The rules that keep the binary working

- `app/server.ts` is the entrypoint. Its scaffolded shape — the four `_generated` imports passed to `createServer()` — is what makes zero-read boot possible; keep them.
- `app/_generated/` and `route-types.gen.ts` are **generated** — never hand-edit; re-run codegen instead. Re-run `codegen:registry` after adding/removing routes or `"use server"` files (or just use `bractjs compile`, which always runs the full sequence).
- Global middleware belongs in `app/server.ts` — that's how it applies in dev, `start`, *and* the binary (see [Concepts](concepts.md#the-three-run-modes)).
- `lifecycle.ts` hooks are picked up automatically by `dev`/`start`, but a compiled entry wires them explicitly: `createServer({ ...lifecycle })` ([§16](../README.md#16-lifecycle-hooks)).

## Rendering modes and what they change

All opt-in, all composable with either run path ([§21](../README.md#21-build--run)):

- **Streaming SSR (default)** — every document GET renders on the server. Nothing to configure.
- **Per-route selective SSR** — `export const ssr = false | "data-only"` plus a `Fallback` on heavy interactive routes. `beforeLoad` still always runs server-side, so this is not an auth bypass.
- **App-wide SPA mode** — `ssr: false` in `bractjs.config.ts`. One static shell for every document GET; the server still runs loaders (`/_data`), actions (CSRF intact), `/api`, and `/_image`. Trade-off: no SEO for route content.
- **Prerendering (SSG)** — `prerender: ["/", "/about", ...]` in `bractjs.config.ts` (or an async function returning paths). The build runs the real loaders and writes each path's HTML **and** `/_data` payload under `build/client/_prerender/`; production serves those before falling back to dynamic SSR. Loaders' dependencies (DB, env) must be available at build time; paths must be concrete; a query string opts back into SSR.

Prerender note for binaries: ship `build/client/` (including `_prerender/`) via `--asset` or alongside the executable. On Cloudflare, upload `build/client/` as static assets so the platform serves prerendered files before the worker runs ([§23](../README.md#23-custom-adapters)).

## Embedding in your own server

`buildFetchHandler(config)` returns the adapter-agnostic `(Request) => Promise<Response>` core — mount it under your own `Bun.serve`, or supply a custom adapter via `createServer({ adapter })`. ([§21](../README.md#21-build--run), [§23](../README.md#23-custom-adapters))

## Production checklist

**Environment**

- [ ] `SESSION_SECRET` set (≥16 chars; `openssl rand -base64 32`) — and any other secrets — via real environment variables, not files bundled into the binary
- [ ] `NODE_ENV` **not** `development` — dev mode puts full error messages and stacks in responses
- [ ] `PORT` set (scaffold default: `3000`)
- [ ] Client-visible env vars allowlisted via `clientEnv` — nothing else reaches the browser ([§17](../README.md#17-environment-variables))

**Security**

- [ ] Session cookie `secure: true`
- [ ] `csp()` in the global pipeline — it's opt-in. Dev keeps it enabled too (the HMR socket is auto-allowed), so the policy you verify in dev is the one you ship ([§14](../README.md#14-middleware))
- [ ] `cors()` only if you actually serve cross-origin clients, with explicit origins — and never expose `X-BractJS-Action` in a custom CORS layer (it's part of the CSRF gate)
- [ ] Auth checklist from the [authentication guide](authentication.md#checklist) done
- [ ] Body-size ceiling (`maxRequestBodySize`, default 16 MiB) raised only if you have a real large-upload endpoint

**Operations**

- [ ] `onShutdown` closes what `onStart` opened (DB connections, telemetry flush) — it fires on any exit signal
- [ ] `onError` wired to your error tracker; it receives every unexpected loader/action/process error, with redirects and `HttpError`s already filtered out
- [ ] Health check: any cheap route works; `/api` endpoints register by import from `root.tsx`, so a compiled binary 404ing on one means the import chain broke, not the deploy

**Verify before shipping a binary**

```sh
bractjs compile ./myapp && ./myapp   # boot it
curl -fsS localhost:3000/            # a page
curl -fsS localhost:3000/api/...     # one registered endpoint
```

Thirty seconds, and it catches the entire class of "worked in dev, dynamic import broke the compile" issues.
