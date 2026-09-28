# Benchmarks

BractJS, React Router 7, and Next.js serving the same page, measured with the harness in [`bench/`](../bench/). This page gives the results, exactly what was measured, and what the numbers do **not** show. Read the caveats before quoting a number.

## Results

Run on 2026-09-27. Raw data: [`bench/results/2026-09-27.json`](../bench/results/2026-09-27.json).

|                                          |     BractJS 0.4.1 | React Router 7.18.4 |     Next.js 16.3.6 |
| ---------------------------------------- | ----------------: | ------------------: | -----------------: |
| Runtime                                  |         Bun 1.4.2 |        Node 24.15.0 |       Node 24.15.0 |
| **Requests/s** (`/`, median of 3 rounds) |         **6,127** |               2,998 |              1,152 |
| Latency p50 / p99                        |         7 / 15 ms |          16 / 25 ms |         42 / 55 ms |
| First-load JS, gzipped                   | 64.2 KB (7 files) |  100.9 KB (4 files) | 134.0 KB (7 files) |
| First-load JS, uncompressed              |          196.6 KB |            310.4 KB |           451.5 KB |
| **Compression the server applies**       |       **none** ⚠️ |              brotli |               gzip |
| HTML document, gzipped                   |            3.8 KB |              4.8 KB |             4.9 KB |
| Server memory (RSS) after load           |            137 MB |              461 MB |             523 MB |
| Cold start → first `200`                 |             35 ms |              131 ms |             177 ms |
| Clean production build                   |            0.08 s |              0.78 s |             2.25 s |

Machine: Apple M5 Max (18 cores, 128 GB), macOS (Darwin 27.0.0), React 19.2.6 in all three apps. Load: [autocannon](https://github.com/mcollina/autocannon) 8.0.0, 50 connections, 5 s warmup, then 3 rounds of 10 s; every round had zero errors and zero non-2xx responses. Across rounds each framework's throughput varied by less than 3%.

> ⚠️ **BractJS does not compress responses.** The gzipped column compares bundle _sizes_; it is not what a visitor downloads. Without a compressing reverse proxy or CDN in front, a first visit transfers BractJS's **196.6 KB of uncompressed JavaScript**, nearly twice what React Router sends (its bundle is 101 KB gzipped and it serves brotli, which is smaller still). Put BractJS behind something that compresses (nginx, Caddy, Cloudflare, most CDNs) until the framework does it itself.

## What was measured

Each framework has one app in `bench/apps/`, written the way that framework's docs recommend, rendering the same page:

- **`/`** — a layout with a two-link nav, an `<h1>`, a small interactive counter (a `useState` button, so each framework must ship and hydrate client code), and a 100-row table. The rows come from an async data function (`bench/shared/data.ts`, copied verbatim into each app; the harness refuses to run if a copy drifts). BractJS and React Router read it in a `loader`; Next.js awaits it in a server component marked `dynamic = "force-dynamic"`.
- **Production builds** served by each framework's standard production server: `bractjs start`, `react-router-serve`, `next start`. One process each, `NODE_ENV=production`.

Per app, `bench/run.ts`:

1. Deletes previous output and times a **clean production build**.
2. Starts the server and times **spawn → first `200` on `/`**.
3. Loads `/` in headless Chrome ([`bench/page-weight.mjs`](../bench/page-weight.mjs)) and records **every script the browser downloads** — including chunks loaded by dynamic import after boot, which scraping `<script>` tags would miss. It **clicks the counter and fails the run unless the page hydrates**. Each file is then re-fetched uncompressed and gzipped by the harness, so sizes compare bundles rather than server settings. The encoding the server actually sent is recorded separately.
4. Runs autocannon against `/`: one warmup, then N measured rounds. The table reports the median round.
5. Records the **resident memory of the server's whole process tree** (Next.js can fork) right after the load.

It also measures a **load-generator ceiling** — autocannon against a Bun server that does no work — to show the numbers measure the frameworks, not autocannon. On this machine the ceiling was **134,682 req/s**, 22× the fastest framework.

## Caveats

- **Runtime and framework are measured together.** BractJS only runs on Bun, and the other two are measured on Node, the runtime their production servers target. Part of BractJS's throughput and memory advantage is Bun's, not the framework's. That is the real choice you'd be making, but it is not a framework-only comparison.
- **One page, one machine, loopback.** A 100-row table with no I/O mostly measures SSR and serialization overhead. With a real database or external API, data latency dominates and the gaps shrink. Loopback latency doesn't include network time.
- **Single process.** Nobody was clustered. All three can scale across cores (multiple processes behind a load balancer); that multiplies throughput and memory for each alike.
- **React Router runs its own `dist/development` build on Node.** Its package export map points every Node condition at `dist/development`, so `react-router-serve` loads that build even with `NODE_ENV=production`. That is what the official server does, so it is measured as shipped. `react-router-serve` also logs every request; the same build behind express with compression and no logging did about **3,070 req/s** (3 rounds: 3,141 / 2,981 / 3,084), so logging accounts for roughly 3%.
- **Next.js does more per request.** With the App Router, every response also carries the React Server Components payload, and `next build` also typechecks. Its per-request and build numbers include work the other two don't do. If this page could be static, Next.js would prerender it at build time and serve it from cache.
- **Build times aren't feature-equivalent.** BractJS's build is one `Bun.build` pass with no typechecking. React Router uses Vite; Next.js uses Turbopack and runs `tsc`.
- **React Router 8 was not measured.** RR 8.4.0 is current; 7.18.4 was chosen to match the [migration guide](migrating-from-remix.md). Rerun with `react-router@8` to update.

## Running it yourself

Needs Bun, Node ≥ 22, and Google Chrome (used headless via `playwright-core`; no browser download).

```sh
pnpm install          # repo root — links the BractJS bench app to packages/core
cd bench
npm run setup         # installs autocannon + playwright-core, and the React Router and Next.js apps (outside the pnpm workspace)
bun run run.ts        # --rounds 3 --duration 10 --connections 50 are the defaults
```

It prints the table above and writes `bench/results/<date>.json`; server logs go to `bench/results/logs/`. Close other heavy programs first. Results from different machines aren't comparable, so compare runs from the same machine only.
