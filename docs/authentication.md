# Authentication end to end

Auth is where BractJS's scoping rules matter most: the framework gives you secure primitives, but _where you attach a guard determines what it actually protects_. This guide builds a session-based login and then walks every server surface, showing exactly how each one gets guarded. The patterns come from [`examples/cms`](../examples/cms/), which implements all of this (plus 2FA and OAuth) and is the reference when in doubt.

## The one-table summary

Guards do not cascade across surfaces. This table is the whole guide in miniature — everything below is elaboration:

| Surface                                 | Guarded by                                                       | NOT guarded by                    |
| --------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| Pages + their `/_data` (soft-nav JSON)  | Layout/route `middleware` export, or `beforeLoad`                | A check inside the component      |
| Typed `/api` endpoints                  | `route(..., { middleware: [...] })`, or checks in the handler    | Layout/route `middleware` exports |
| Server actions (`/_action`, `/_stream`) | Checks **inside the function body**                              | Layout/route `middleware` exports |
| Everything at once                      | Global `pipeline.use(...)` in `app/server.ts` (e.g. `authGuard`) | —                                 |

## 1. Sessions

BractJS ships signed cookie sessions (HMAC-SHA256, constant-time verification, secret rotation). Create one in a `.server.ts` module so it can never reach the client bundle:

```ts
// app/session.server.ts
import { createCookieSession } from "@bractjs/bractjs";

export const session = createCookieSession({
  name: "__session",
  secrets: [Bun.env.SESSION_SECRET!], // ≥16 chars; rotate by prepending a new one
  maxAge: 60 * 60 * 24 * 7, // 1 week
  secure: true, // false only for local HTTP dev
  sameSite: "Lax",
});
```

Generate a secret with `openssl rand -base64 32`. Tampered cookies are silently rejected and read as an empty session. ([§15](../README.md#15-sessions))

A pair of helpers keeps the rest of the app clean:

```ts
// app/auth.server.ts
import { redirect } from "@bractjs/bractjs";
import { session } from "./session.server.ts";

export interface User {
  id: string;
  name: string;
}

export async function getUser(request: Request): Promise<User | null> {
  const s = await session.getSession(request.headers.get("Cookie"));
  return (s.get("user") as User | undefined) ?? null;
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);
  if (!user) {
    const next = encodeURIComponent(new URL(request.url).pathname);
    throw redirect(`/login?next=${next}`); // thrown redirects are control flow
  }
  return user;
}
```

## 2. Login and logout

```tsx
// app/routes/login.tsx
import type { ActionArgs } from "@bractjs/bractjs";
import { Form, redirect, useActionData } from "@bractjs/bractjs";
import { session } from "../session.server.ts";
import { verifyCredentials } from "../auth.server.ts"; // your own check (hash compare, etc.)

export async function action({ formData, request }: ActionArgs) {
  const user = await verifyCredentials(
    String(formData.get("username") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!user) return { error: "Invalid username or password" };

  const s = await session.getSession(request.headers.get("Cookie"));
  s.set("user", { id: user.id, name: user.name });
  return redirect("/dashboard", {
    headers: { "Set-Cookie": await session.commitSession(s) },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  return (
    <Form method="post">
      <input name="username" autoComplete="username" />
      <input name="password" type="password" autoComplete="current-password" />
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      <button type="submit">Sign in</button>
    </Form>
  );
}
```

Logout is an action that commits an expired session and redirects. Note what you did _not_ build: CSRF protection. Cross-site form POSTs are already rejected with a 403 before any action runs.

## 3. Gating pages — and why not in the component

The rule that trips everyone up: **when a user soft-navigates with `<Link>`, the page component doesn't render on the server — but the loaders still run**, via the `/_data` JSON endpoint. A `{!user && <Redirect/>}` check in a component protects pixels, not data; the loader JSON would still be served. Gates must run server-side, before loaders.

BractJS guarantees `/_data` runs the same `middleware` and `beforeLoad` gates as the full document — so either of these is safe:

**A layout `middleware` export** — gates a whole subtree, composable:

```tsx
// app/routes/dashboard/layout.tsx — gates every /dashboard/* page
import type { RouteMiddlewareFunction } from "@bractjs/bractjs";
import { Outlet, redirect } from "@bractjs/bractjs";
import { getUser } from "../../auth.server.ts";

const requireAuth: RouteMiddlewareFunction = async (ctx, next) => {
  const user = await getUser(ctx.request);
  if (!user) return redirect("/login");
  ctx.context.user = user; // now visible to every loader below
  return next();
};

export const middleware = [requireAuth];

export default function DashboardLayout() {
  return <Outlet />;
}
```

**`beforeLoad`** — the lighter single-route gate ([§5](../README.md#5-route-module-api), item 4).

### The public-paths exception

If the _login page itself_ lives inside the gated subtree, gate-then-exempt — otherwise unauthenticated visitors to `/login` redirect to `/login` forever. From [`examples/cms`](../examples/cms/app/routes/admin/layout.tsx), which does this in the layout **loader** (equally safe — loaders are behind the same shared gate sequence):

```ts
const PUBLIC_PATHS = new Set(["/admin/login", "/admin/verify", "/admin/logout"]);

export async function loader({ request }: LoaderArgs) {
  const pathname = new URL(request.url).pathname;
  if (PUBLIC_PATHS.has(pathname)) return { user: await getAdmin(request) };
  return { user: await requireAdmin(request) }; // throws redirect if anonymous
}
```

Every public sub-path must be listed deliberately — when the CMS added 2FA, `/admin/verify` had to join the set because it runs _before_ a full session exists.

## 4. Guarding typed `/api` endpoints

**Layout `middleware` exports do not cover `/api`.** The dashboard layout above protects `/dashboard` pages — an `/api/dashboard/stats` endpoint is wide open unless you guard it where it's defined:

```ts
// app/api/stats.ts
import type { MiddlewareFn } from "@bractjs/bractjs";
import { route } from "@bractjs/bractjs";
import { getUser } from "../auth.server.ts";

const requireUserApi: MiddlewareFn = async (ctx, next) => {
  const user = await getUser(ctx.request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  ctx.context.user = user;
  return next();
};

export const getStats = route(
  "GET",
  "/api/dashboard/stats",
  async (_input, _req, ctx) => loadStatsFor(ctx.context.user),
  { middleware: [requireUserApi] },
);
```

The endpoint chain runs before body parsing, so an unauthorized request is rejected before its payload is even buffered. Repeating a guard across many endpoints? Define it once and share it — or hoist it into the global pipeline (below). ([§12](../README.md#12-typed-api-routes))

## 5. Server actions authorize themselves

Every exported function of a `"use server"` module is a public RPC endpoint at `POST /_action`. The CSRF gate proves the call came from your origin — **it does not prove who is calling**. No middleware surface wraps individual actions, so the function body is the guard:

```ts
"use server";
import { requireUser } from "./auth.server.ts";

export async function deletePost(request: Request, postId: string) {
  const user = await requireUser(request); // first line, every action
  await db.posts.deleteOwned(postId, user.id);
}
```

Streaming actions (`GET /_stream`) are invoked with _no caller input_ — they must be safe to call with none, and must authorize themselves the same way. ([§27](../README.md#27-security-model))

## 6. The global option: `authGuard`

To attach identity to **every** request — pages, `/api`, actions, all of it — use the built-in `authGuard` in `app/server.ts`, where it applies in dev, `start`, and the compiled binary alike:

```ts
// app/server.ts
import { authGuard, pipeline } from "@bractjs/bractjs";
import { session } from "./session.server.ts";

pipeline.use(authGuard({ session })); // sets ctx.context.user everywhere
// authGuard({ session, required: true })       // …or hard-401 everything unauthenticated
```

With `required: true` this is the strongest configuration — nothing can be forgotten — but it's all-or-nothing (static assets and public pages get 401'd too), so most apps use the annotating form globally plus per-surface gates from §3–§5.

## 7. What the framework already handles

So you don't re-implement it — or accidentally disable it ([§27](../README.md#27-security-model)):

- **CSRF** on actions, `/_stream`, route mutations, and `/api` — layered `Sec-Fetch-Site` + custom-header + `Origin` checks. Two ways to break it yourself: passing `route(..., { csrf: false })` on an endpoint that trusts session cookies, or adding `X-BractJS-Action` to `Access-Control-Allow-Headers` in a hand-rolled CORS layer (the built-in `cors()` deliberately omits it).
- **Session integrity** — signed, constant-time-verified cookies; tampering yields an empty session, not an error to probe.
- **Open-redirect neutralization** — `redirect()` refuses off-origin targets unless you pass `{ allowExternal: true }`, so `?next=` flows are safe by default.
- **Error sanitization** — production errors are generic to the client; never put secrets in a raw `Error.message`.

## Checklist

- [ ] Session secret from the environment, ≥16 chars, `secure: true` in production
- [ ] Session created in a `*.server.ts` module
- [ ] Pages gated via layout `middleware` or `beforeLoad` — never only in components
- [ ] Login/verify/logout routes in the public-paths exemption (no redirect loops)
- [ ] Every `/api` endpoint that needs auth has `{ middleware: [...] }` — layout guards don't reach it
- [ ] Every `"use server"` function authorizes in its body — CSRF ≠ authentication
- [ ] No `{ csrf: false }` on endpoints that trust session cookies
- [ ] Rate-limit login attempts (see `checkLoginRate` in [`examples/cms/app/auth.server.ts`](../examples/cms/app/auth.server.ts))

For 2FA (email OTP), OAuth (Google/Microsoft), and RBAC on top of this foundation, read [`examples/cms`](../examples/cms/) — it's a working, tested implementation of everything in this guide.
