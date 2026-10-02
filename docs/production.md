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
COPY --from=build /app/build/client ./build/client
COPY --from=build /app/public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["./server"]
```

- The binary listens on `PORT`, which Fly, Render, Railway and Kubernetes set. Point their health check at `/healthz`.
- `build/client` and `public/` ship next to the binary (see [Deployment](deployment.md) for embedding them).
- On Fly.io, `fly launch` detects the Dockerfile. Set `internal_port = 3000` and add an `[[http_service.checks]]` entry for `GET /healthz`.
- Behind Fly's or any platform's proxy, the socket address is the proxy's: set `TRUST_PROXY=1` and pass `trustProxy` to `rateLimit` / `getClientAddress`.
