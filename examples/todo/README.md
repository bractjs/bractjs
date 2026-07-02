# Demo Todo (BractJS)

A multi-route todo app showing the core BractJS workflow end to end:

- **File-based routing** — `_index.tsx` (`/`), `[id].tsx` (`/:id` detail/edit), `about.tsx` (`/about`).
- **Server loaders & actions** with `<Form>` revalidation — no hand-written client fetch.
- **Server-only data** — a `bun:sqlite` store in `app/todos.server.ts`; the `.server.ts` suffix keeps it out of the browser bundle.
- **Input validation** via the built-in `validate()` helper (dependency-free schema; swap in Zod for real apps). Form input is parsed into a null-prototype object, so a stray `__proto__` field can't pollute `Object.prototype`.
- **CSRF is automatic** — add/rename/toggle/delete all submit through `<Form>`, which carries BractJS's same-origin gate, so another site can't forge writes against your session. No token code to write.
- **Typed API route** — `app/api/stats.ts` registers `GET /api/stats` with `route()` (try `curl localhost:3000/api/stats`). It's a GET, so it's CSRF-exempt; a mutating `route("POST", …)` would be CSRF-protected by default, exactly like `<Form>`.
- **Per-route `headers()`** — `about.tsx` exports `headers()` to send `Cache-Control: public, max-age=3600` on its document/`/_data` responses.
- **`HttpError(404)` + `ErrorBoundary`** — unknown ids render a not-found page.
- **Filters** driven by the URL query string (`/?filter=active`).
- **Single-binary deploy** via `bun build --compile`.

## Layout

```
app/
├── root.tsx              # document shell + top nav
├── server.ts             # single-binary entry (bun build --compile)
├── todos.server.ts       # bun:sqlite data layer (server-only)
├── validation.ts         # tiny .safeParse() schema for validate()
├── ui.tsx                # shared inline-style building blocks
├── api/
│   └── stats.ts          # GET /api/stats — typed route() JSON endpoint
└── routes/
    ├── _index.tsx        # → /        board: list + filters + add
    ├── [id].tsx          # → /:id     detail: rename / toggle / delete
    └── about.tsx         # → /about   feature tour (+ Cache-Control headers())
```

## Run

```sh
# From the repo root (pnpm links the example to packages/core via workspace:*)
pnpm install

cd examples/todo
bun run dev
```

Open `http://localhost:3000`.

The SQLite database is in-memory, so it reseeds on every restart. To persist
across restarts, change `":memory:"` to a file path in `app/todos.server.ts`.

## Build & start

```sh
bun run build     # production client + server bundles
bun run start     # serve the build
```

## Single-binary (bun build --compile)

```sh
bun run compile         # → ./bin/todo-app
bun run start:bin       # ./bin/todo-app
```

## PM2 (production)

```sh
cd /path/to/bractjs
bun run --cwd examples/todo compile
pm2 start examples/todo/pm2.config.cjs
pm2 logs todo-app
```

This uses Bun's single-file executable flow (`bun build --compile`) through
`bractjs compile`: https://bun.com/docs/bundler/executables
