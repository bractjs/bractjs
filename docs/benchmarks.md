# Benchmarks

BractJS, React Router 8, and Next.js serving the same page, measured with the harness in [`bench/`](../bench/). This page gives the results, exactly what was measured, and what the numbers do **not** show. Read the caveats before quoting a number.

## Results

Run on 2026-09-30. Raw data: [`bench/results/2026-09-30.json`](../bench/results/2026-09-30.json).

|                                          |     BractJS 0.6.0 | React Router 8.4.0 |     Next.js 16.3.6 |
| ---------------------------------------- | ----------------: | -----------------: | -----------------: |
| Runtime                                  |         Bun 1.4.2 |       Node 24.15.0 |       Node 24.15.0 |
| **Requests/s** (`/`, median of 3 rounds) |         **4,502** |              1,747 |              1,083 |
| Latency p50 / p99                        |        12 / 17 ms |         28 / 36 ms |         45 / 55 ms |
| **First-load JS over the wire**          |       **58.7 KB** |           102.6 KB |           134.2 KB |
| First-load JS, gzipped                   | 67.4 KB (7 files) | 101.1 KB (5 files) | 134.0 KB (7 files) |
| First-load JS, uncompressed              |          205.8 KB |           308.0 KB |           451.5 KB |
| HTML document, gzipped                   |            3.8 KB |             4.8 KB |             4.9 KB |
| Server memory (RSS) after load           |            186 MB |             319 MB |             504 MB |
| Cold start → first `200`                 |             30 ms |             100 ms |             174 ms |
| Clean production build                   |            0.04 s |             0.62 s |             2.21 s |
| Compression of `/` under load            |              gzip |             brotli |               gzip |

Machine: Apple M5 Max (18 cores, 128 GB), macOS (Darwin 27.0.0). React 19.2.6 in the BractJS and Next.js apps; React Router 8 requires React 19.2.7 or later, so its app runs 19.2.7. Load: [autocannon](https://github.com/mcollina/autocannon) 8.0.0, 50 connections, sending a browser's `Accept-Encoding: gzip, deflate, br, zstd`, 5 s warmup, then 3 rounds of 10 s. Every round had zero errors and zero non-2xx responses. Rounds varied by about 2% this time (Next.js 1,068–1,089), but earlier runs varied by up to ~12%, so treat differences under ~10% as noise.

"Over the wire" is what Chrome actually transferred: the encoded bytes of every script, as each server chose to send them. "Gzipped" re-compresses each file the same way for every framework, so it compares bundle sizes independently of server settings. BractJS serves its hashed client bundle brotli-compressed at maximum quality (cached in memory after the first request) and streamed HTML gzip-compressed.

> **Earlier runs** used BractJS 0.4.1 and React Router 7.18.4. [`2026-09-28.json`](../bench/results/2026-09-28.json) sent the same `Accept-Encoding` header: BractJS 4,494 req/s, React Router 7 1,730, Next.js 1,006. BractJS's JavaScript has grown by about 2 KB gzipped since 0.4.1, with throughput unchanged. [`2026-09-27.json`](../bench/results/2026-09-27.json) predates BractJS's response compression and sent no `Accept-Encoding`, so no server compressed: BractJS 6,127 req/s, React Router 2,998, Next.js 1,152. Sending the browser header costs every server throughput, React Router proportionally the most.

## What was measured

Each framework has one app in `bench/apps/`, written the way that framework's docs recommend, rendering the same page:

- **`/`** — a layout with a two-link nav, an `<h1>`, a small interactive counter (a `useState` button, so each framework must ship and hydrate client code), and a 100-row table. The rows come from an async data function (`bench/shared/data.ts`, copied verbatim into each app; the harness refuses to run if a copy drifts). BractJS and React Router read it in a `loader`; Next.js awaits it in a server component marked `dynamic = "force-dynamic"`.
- **Production builds** served by each framework's standard production server: `bractjs start`, `react-router-serve`, `next start`. One process each, `NODE_ENV=production`.

Per app, `bench/run.ts`:

1. Deletes previous output and times a **clean production build**.
2. Starts the server and times **spawn → first `200` on `/`**.
3. Loads `/` in headless Chrome ([`bench/page-weight.mjs`](../bench/page-weight.mjs)) and records **every script the browser downloads** — including chunks loaded by dynamic import after boot, which scraping `<script>` tags would miss. It **clicks the counter and fails the run unless the page hydrates**. It records the encoded bytes Chrome transferred for each script ("over the wire"), then re-fetches each file uncompressed and gzips it itself, so the gzipped column compares bundles rather than server settings.
4. Runs autocannon against `/` with a browser's `Accept-Encoding` header, so each server does the compression it would do for real visitors: one warmup, then N measured rounds. The table reports the median round.
5. Records the **resident memory of the server's whole process tree** (Next.js can fork) right after the load.

It also measures a **load-generator ceiling** — autocannon against a Bun server that does no work — to show the numbers measure the frameworks, not autocannon. On this machine the ceiling was **141,585 req/s**, 31× the fastest framework.

## Caveats

- **Runtime and framework are measured together.** BractJS only runs on Bun, and the other two are measured on Node, the runtime their production servers target. Part of BractJS's throughput and memory advantage is Bun's, not the framework's. That is the real choice you'd be making, but it is not a framework-only comparison.
- **One page, one machine, loopback.** A 100-row table with no I/O mostly measures SSR and serialization overhead. With a real database or external API, data latency dominates and the gaps shrink. Loopback latency doesn't include network time.
- **Single process.** Nobody was clustered. All three can scale across cores (multiple processes behind a load balancer); that multiplies throughput and memory for each alike.
- **React Router is measured as `react-router-serve` ships it.** Its server logs every request. In the earlier React Router 7 run without compression, the same build behind express with no request logging did about **3,070 req/s** against 2,998 as shipped, so logging costs roughly 3%. (React Router 7 also loaded its `dist/development` build on Node even with `NODE_ENV=production`. React Router 8's export map resolves to `dist/production`, and throughput barely moved: 1,747 req/s against 1,730.)
- **Next.js does more per request.** With the App Router, every response also carries the React Server Components payload, and `next build` also typechecks. Its per-request and build numbers include work the other two don't do. If this page could be static, Next.js would prerender it at build time and serve it from cache.
- **Each server compresses its own way.** BractJS gzips streamed HTML and serves brotli for its cached bundle; React Router's express server uses brotli (and skips small files); Next.js uses gzip. Throughput includes each server's compression cost; wire sizes reflect each server's choices.
- **Build times aren't feature-equivalent.** BractJS's build is one `Bun.build` pass with no typechecking. React Router uses Vite; Next.js uses Turbopack and runs `tsc`.
- **React Router 7 is not measured anymore.** The [migration guide](migrating-from-remix.md) covers both 7 and 8; the 2026-09-28 results above are the latest React Router 7 numbers.

## Running it yourself

Needs Bun, Node ≥ 22, and Google Chrome (used headless via `playwright-core`; no browser download).

```sh
pnpm install          # repo root — links the BractJS bench app to packages/core
cd bench
npm run setup         # installs autocannon + playwright-core, and the React Router and Next.js apps (outside the pnpm workspace)
bun run run.ts        # --rounds 3 --duration 10 --connections 50 are the defaults
```

It prints the table above and writes `bench/results/<date>.json`; server logs go to `bench/results/logs/`. Close other heavy programs first. Results from different machines aren't comparable, so compare runs from the same machine only.
