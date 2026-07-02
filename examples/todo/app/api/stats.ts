// app/api/stats.ts — a typed JSON API endpoint.
//
// `route(method, path, handler)` registers a type-safe endpoint under `/api/*`.
// The registration is a side effect of importing this module, so it has to be
// imported once on the server. Route files (and root.tsx) aren't enough on
// their own — the dev server never runs app/server.ts — so we import this from
// root.tsx, which IS loaded in dev, prod, and the compiled binary alike.
//
// This is a GET, so it's exempt from the CSRF gate and safe to call cross-site.
// A mutating route (POST/PUT/PATCH/DELETE) would be CSRF-protected by default:
// the request would have to prove same-origin, exactly like a <Form> submit.
// `createClient` adds that proof automatically; pass `{ csrf: false }` only for
// credential-free public endpoints (webhooks, token-authed APIs).

import { route } from "@bractjs/bractjs";
import { getStats } from "../todos.server.ts";

// GET /api/stats → { total, active, completed }
// Try it: `curl http://localhost:3000/api/stats`
export const getStatsRoute = route("GET", "/api/stats", () => getStats());
