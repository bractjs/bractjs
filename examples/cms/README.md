# BractJS CMS Example

A small WordPress-style content management system built on BractJS. It pairs a
public, published-only site with an authenticated admin and shows off the parts
of the framework a simple demo doesn't: **cookie sessions, nested routing,
layouts, typed `route()` API endpoints, file uploads, the `<Image>` optimizer,
`"use client"` interactive components, and multi-entity CRUD** — all backed by
`bun:sqlite`. The UI is styled with **Tailwind CSS v4** and **lucide** icons, and
sign-in is **two-factor (password + emailed code)** with optional **Google /
Microsoft OAuth**.

```bash
pnpm install         # run at the repo root — links the example to packages/core (workspace:*)
bun run dev          # builds CSS (predev) + starts http://localhost:3200
bun run css:watch    # (optional, 2nd terminal) live-recompile Tailwind on class changes
```

**Signing in** (`/admin/login`):

1. Username + password — seeded `admin` / `admin123`.
2. A 6-digit code is emailed as the second factor. With no SMTP configured (the
   default), the code is **printed to the dev server console** — copy it into the
   verify screen. `ADMIN_EMAIL` (default `admin@example.com`) sets where the
   seeded admin's code is "sent".

### Auth configuration (`.env`, all optional)

| Var | Purpose |
| --- | --- |
| `SESSION_SECRET` | HMAC secret for the signed cookies (≥16 chars; set in prod). |
| `ADMIN_EMAIL` | Email for the seeded admin's 2FA code. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Real email delivery; omit for the console fallback. |
| `APP_URL` | Public origin used to build OAuth redirect URIs (default `http://localhost:3200`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enables "Continue with Google". Redirect URI: `${APP_URL}/api/auth/google/callback`. |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT` | Enables "Continue with Microsoft". Redirect URI: `${APP_URL}/api/auth/microsoft/callback`. |

OAuth buttons only render for configured providers. OAuth is **authorization-gated
by the user table**: an account must already exist with the provider's verified
email — sign-in never auto-provisions an admin. (See `app/oauth.server.ts`,
`app/api/auth.ts`.)

### Tests

```bash
bun test        # auth, MFA, OAuth, and user-model units (in-memory SQLite)
bun run typecheck
```

## Features

- **Public site** (`/`, `/posts`, `/posts/:slug`, `/category/:slug`, and nested
  pages at `/:...slug`) showing only **published** content.
- **Headless JSON feed** — `GET /api/posts` (typed `route()` endpoint in
  `app/api/posts.ts`) returns published posts for any client. Try
  `curl localhost:3200/api/posts`. Read-only and public, so it never touches the
  admin session.
- **Admin** (`/admin/*`) gated by a session cookie:
  - **Posts** — title, slug, excerpt, Markdown-free **rich HTML body**, status
    (draft/published), category, **featured image** + **gallery**, publish
    workflow, delete.
  - **Pages** — hierarchical (parent/child), `menuOrder`, status, featured
    image. Public URL is the full slug path (e.g. `/about/team`).
  - **Categories** — hierarchical (nestable), slug, description.
  - **Media library** — drag-free uploads to `public/uploads/`, alt text,
    usage/reference count, safe delete (unlinks the file).
  - **Menus** — `header` and `footer` locations, items linking to a page, a
    category, or a custom URL, reorderable with up/down. The public nav is
    rendered from these.
  - **Users** — create/edit/delete admin & editor accounts (passwords hashed
    with `Bun.password`); the last account can't be deleted and you can't delete
    yourself while signed in.

## How it's wired (the interesting bits)

- **Data layer** lives in `app/db.server.ts` (the single SQLite handle +
  migrations + an idempotent seed) and `app/models/*.server.ts`. The
  `*.server.ts` suffix keeps the driver and queries out of the client bundle.
- **Auth** (`app/auth.server.ts`): `requireAdmin(request)` reads the signed
  session cookie and is called at the top of **every** admin loader and action
  (the `admin/layout.tsx` loader gates the whole subtree, allow-listing only
  `/admin/login`, `/admin/verify`, `/admin/logout`).

  > **Why not middleware?** The dev server doesn't execute `app/server.ts`, so a
  > global `pipeline.use(authGuard())` there would only run in
  > `start`/compiled mode. Gating inside loaders/actions works identically in
  > dev and production (and also covers the `/_data` soft-nav endpoint). The
  > cookie stores only a user id; the user is re-fetched server-side.

- **Two-factor sign-in** (`app/mfa.server.ts`, `app/email.server.ts`): after the
  password (factor 1) verifies, the user id is parked in a separate 10-minute
  signed `cms_mfa` cookie and a 6-digit code (CSPRNG, SHA-256-hashed, 10-min TTL,
  5-attempt cap) is emailed (factor 2). The real `cms_session` cookie is issued
  only after the code verifies — or after a successful OAuth sign-in. Issuing and
  verifying are rate-limited (`app/ratelimit.server.ts`). `/admin/verify` is
  reachable without a full session precisely because it *is* the second factor.

- **OAuth** (`app/oauth.server.ts`, `app/api/auth.ts`): typed `route()` GET
  endpoints under `/api/auth/<provider>/{start,callback}` run the authorization-
  code flow. A signed `cms_oauth` cookie carries the CSRF `state` across the round
  trip; only the provider's **verified** email is trusted, and it must match an
  existing account. Registered via a side-effect import in `root.tsx` (the one
  module that loads in dev, prod, and the compiled binary).

- **File uploads** (`app/upload.server.ts`): the `<Form encType="multipart/form-data">`
  posts a `File`, the action validates it and `Bun.write`s it to
  `public/uploads/`, then stores a row. Files are served from `/public/...`;
  public images render through the `<Image>` optimizer (`/_image`).
- **Rich editor** (`app/components/RichEditor.tsx`, `"use client"`): a
  contentEditable surface that mounts on the client and keeps a hidden field in
  sync so the surrounding `<Form>` submits the body normally. It renders `null`
  during SSR and the first client render (then mounts) to avoid a hydration
  mismatch; the admin requires JS. Bodies are sanitized (`app/sanitize.ts`)
  before render.
- **Validation** (`app/validation.ts`): dependency-free `.safeParse()` schemas
  passed to BractJS's `validate()`. Form bodies are parsed into null-prototype
  objects, so a field named `__proto__` can't pollute `Object.prototype`.
- **CSRF** is automatic. Every admin write goes through a server action or a
  `<Form>` submit, both of which carry BractJS's same-origin gate
  (`Sec-Fetch-Site` / `X-BractJS-Action` / `Origin`), so a cross-site page
  can't drive a logged-in admin's cookies to create/delete content — you don't
  write any token-handling code. `requireAdmin` then handles *authorization* on
  top of that. The same gate covers typed `/api` routes: the public
  `GET /api/posts` feed is CSRF-exempt (GETs are), but a mutating
  `route("POST", "/api/…")` would be CSRF-protected by default — opt out with
  `{ csrf: false }` only for a credential-free public/webhook endpoint.
- **Response caching** — the public `/posts` index exports `headers()` to send
  `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` for CDNs. The
  session-gated `/admin` routes deliberately stay uncached.

## Production & single-binary

Dev needs no codegen. For `start` / `compile`, the generated registry/manifest
modules under `app/_generated/` are required:

```bash
bun run build        # client + server bundles
bun run start        # serve the build on :3200

# …or one self-contained binary:
bun run compile      # → ./bin/cms-app   (runs codegen + build + bun --compile)
bun run start:bin    # ./bin/cms-app
```

> The SQLite file (`CMS_DB`, default `./cms.db`) and `public/uploads/` resolve
> against the **process CWD**. Run the binary from this directory (the included
> `pm2.config.cjs` sets `cwd`), or point `CMS_DB`/`UPLOAD_DIR` somewhere stable.

## Reset

Delete `cms.db*` and the files in `public/uploads/` to start from a fresh seed.
