# Running in production

What to add to an app before it serves real traffic: request ids and logs, health checks, security headers, rate limits, sessions that scale, and a container recipe. Everything here is opt-in middleware registered in `app/server.ts`, which runs under `bractjs start`, `bractjs dev` and the compiled binary alike.

## A typical `app/server.ts`

```ts
import {
  createServer,
  csp,
  healthCheck,
  pipeline,
  rateLimit,
  requestId,
  requestLogger,
  secureHeaders,
} from "@bractjs/bractjs";
import { db } from "./db.server.ts";

pipeline.use(healthCheck({ check: () => db.ping() })); // first: nothing should block a probe
pipeline.use(requestId());
pipeline.use(requestLogger({ format: "json" }));
pipeline.use(secureHeaders());
pipeline.use(csp());
pipeline.use(
  rateLimit({
    max: 300,
    windowMs: 60_000,
    trustProxy: process.env.TRUST_PROXY === "1",
    match: (r) => r.method !== "GET" || new URL(r.url).pathname.startsWith("/api/"),
  }),
);

createServer({/* registries from bractjs codegen — see the scaffold */});
```

Global middleware wraps every request: documents, `/_data`, `/api`, server actions and static files. Order matters: each runs around the ones registered after it.

## Request ids and logs

`requestId()` gives each request an id. It reuses an incoming `X-Request-Id` when that is 1–128 characters of `[A-Za-z0-9._:-]`, so a load balancer's id carries through, and otherwise generates a UUID. The id is:

- echoed on the response's `X-Request-Id`;
- readable anywhere in the request with `getRequestId()` (loaders, actions, server actions, `onError`);
- prepended to `requestLogger()` lines, and included as `requestId` in its JSON format;
- shown on the built-in 500 page, and available to your own error boundaries via `useRequestId()`, so users can quote it.

```ts
// app/lifecycle.ts — attach it to error reports
import { defineLifecycle, getRequestId } from "@bractjs/bractjs";

export default defineLifecycle({
  onError(err, request) {
    Sentry.captureException(err, { tags: { requestId: request ? getRequestId() : undefined } });
  },
});
```

`requestLogger({ format: "json" })` writes `{ time, level, method, path, status, ms, requestId }` per line (`level` is `error` for 5xx). Pass `write` to send lines somewhere other than stdout. Query strings are never logged, because they often carry tokens.

## Health checks

`healthCheck()` answers `GET` / `HEAD /healthz` before any other middleware or route runs:

- `200 {"status":"ok"}` when healthy;
- `503 {"status":"error"}` when `check()` returns `false` or throws (the error is logged, never sent);
- a value other than `true`/`undefined` from `check()` is returned as `details`.

Change the path with `{ path: "/livez" }`. Register it first, so auth and rate limits never block your orchestrator.

## Security headers

`secureHeaders()` adds, to every response that doesn't already set them:

| Header                         | Default                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `Strict-Transport-Security`    | `max-age=15552000; includeSubDomains`, HTTPS requests only      |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), payment=()`          |
| `Cross-Origin-Opener-Policy`   | `same-origin` (use `same-origin-allow-popups` for OAuth popups) |
| `Cross-Origin-Resource-Policy` | `same-site`                                                     |
| `X-Frame-Options`              | `SAMEORIGIN`                                                    |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                               |
| `X-Content-Type-Options`       | `nosniff`                                                       |

Each option takes a string to change the value, or `false` to omit the header. HSTS counts a request as HTTPS when its URL is `https:` or `X-Forwarded-Proto` says `https`. Pair it with `csp()` for a Content-Security-Policy (README §14).

## Environment variables

Declare them with `defineEnv()` in `app/env.ts` (README §17). The server checks them at startup, so a deploy with a missing `DATABASE_URL` or a malformed `PORT` fails immediately, with the full list, instead of on the first request that needs it. `client` variables are read at runtime too, so the same build works in staging and production.

## Sitemap and robots.txt

`sitemap({ origin })` in `app/server.ts` serves `/sitemap.xml` and `/robots.txt`. The sitemap lists every route without dynamic segments, every path in `prerender`, and whatever `extra()` returns (the concrete URLs of dynamic routes, e.g. from your database). With `i18n` configured it lists each page in every locale, with `hreflang` alternates. `/api/*` is never listed; `exclude` drops more (`["/admin/*"]`, or a predicate). `robots: { disallow: ["/admin"] }` adds rules, and `robots: false` leaves robots.txt to you. Both are cached for `maxAge` seconds (default 3600). `examples/todo` uses it.

## Tracing

`instrument(otel(api))` in `app/server.ts`, with your `@opentelemetry/api` and SDK, traces every request, with child spans for loaders, actions and route middleware, and continues incoming `traceparent` headers. See README §29 ("OpenTelemetry").

## Caching

`cache()` builds a `Cache-Control` header for a route's `headers()`, for `data(value, { headers })`, or for any `Response`:

```ts
import { cache } from "@bractjs/bractjs";

// Browsers reuse the page for 1 minute, a CDN for 1 hour, and the CDN may serve it
// stale for a day while it refreshes in the background.
export const headers = () => cache({ public: true, maxAge: "1m", sMaxAge: "1h", staleWhileRevalidate: "1d" });
```

Durations are seconds or `"30s"`/`"5m"`/`"1h"`/`"7d"`. `private: true` keeps per-user pages out of shared caches; `noStore: true` stores nothing.

Route `headers()` run root → layouts → route, and the innermost value wins (React Router's rule). To keep a layout's limit instead, merge: `mergeCacheControl(parentHeaders.get("Cache-Control"), "public, max-age=3600")` returns the most restrictive combination.

**Responses that set a cookie are never shared-cacheable.** If a response carries `Set-Cookie` and its `Cache-Control` says `public` or `s-maxage`, BractJS rewrites it to `private` (dropping `s-maxage`) after all middleware has run, and warns once per path in development. A CDN would otherwise replay one visitor's session cookie to everyone.

## Rate limiting

`rateLimit({ max, windowMs })` counts requests per client in fixed windows. Past `max` it answers `429 Too Many Requests` with `Retry-After`. Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.

- **The client** is its IP: the socket address under Bun, or with `trustProxy: true` the first `X-Forwarded-For` entry (or `X-Real-IP`). Only set `trustProxy` when a proxy you control always sits in front; otherwise clients can pick their own address. Behind a proxy _without_ `trustProxy`, every request shares the proxy's address, so one bucket covers everyone. Set it, or key the limit yourself.
- **Unknown clients aren't limited.** No address means no limit, because one shared bucket would let anyone lock everybody out.
- **`key(request)`** buckets by something else (an API key, a user id); returning `undefined` skips the request. **`match(request)`** limits only some requests.
- **`store`** defaults to process memory. Implement `{ hit(key, windowMs), reset(key?) }` over Redis to share limits between instances.

For limits inside app logic (attempts per username, emails per account), use `createRateLimiter({ max, windowMs })` and `await limiter.check(key)`. `examples/cms` throttles sign-in this way. `getClientAddress(request, { trustProxy })` gives you the same address `rateLimit` uses.

## Sessions

Cookie sessions (`createCookieSession`) need no storage, but must stay under 4 KB: `commitSession` throws rather than emit a cookie the browser would silently drop. For larger sessions, private data, or revocation, use `createSessionStorage({ cookie, createData, readData, updateData, deleteData })`, whose cookie carries only a signed id. `createMemorySessionStorage` is the in-process version for development and tests. See README §15.

## Containers

The single binary (`bractjs compile`) needs no Bun, `node_modules` or source at runtime:

```dockerfile
# Build
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run compile ./server

# Run
FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=build /app/server ./server
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["./server"]
```

- The binary listens on `PORT`, which Fly, Render, Railway and Kubernetes set. Point their health check at `/healthz`.
- The client build and `public/` are embedded in the binary, so the image needs nothing else.
- On Fly.io, `fly launch` detects the Dockerfile. Set `internal_port = 3000` and add an `[[http_service.checks]]` entry for `GET /healthz`.
- Behind Fly's or any platform's proxy, the socket address is the proxy's: set `TRUST_PROXY=1` and pass `trustProxy` to `rateLimit` / `getClientAddress`.
