# Tutorial: your first BractJS app

In ~15 minutes you'll build a small notes app that exercises the whole framework surface: file-based routes, a server `loader`, a form-handling `action` with validation, a dynamic route with a 404, a typed `/api` endpoint, and finally a single-binary build.

You need [Bun](https://bun.sh) ≥ 1.1. There is no Node.js path.

## 1. Scaffold and run

```sh
bunx bractjs new my-notes
cd my-notes
bun run dev        # http://localhost:3000, HMR websocket on 3001
```

You get an `app/` directory with a root layout (`root.tsx`), a server entry (`server.ts`), and two routes. Open `app/routes/_index.tsx`, change the message, and watch the browser update — no restart.

## 2. A server-only data module

Create `app/notes.server.ts` — an in-memory store standing in for a database:

```ts
// app/notes.server.ts
export interface Note {
  id: string;
  title: string;
  body: string;
}

const notes = new Map<string, Note>([
  ["welcome", { id: "welcome", title: "Welcome", body: "Your first note." }],
]);

export const listNotes = () => [...notes.values()];
export const getNote = (id: string) => notes.get(id) ?? null;
export function addNote(title: string, body: string): Note {
  const id = crypto.randomUUID().slice(0, 8);
  const note = { id, title, body };
  notes.set(id, note);
  return note;
}
```

The `.server.ts` suffix matters: these files **never reach the client bundle** — on the client their imports are replaced with inert stubs, so a DB client or API key here can't leak into browser JS. (Route `loader`/`action` exports are also stripped from client bundles automatically; `.server.ts` is the explicit marker for _everything else_ server-only. See [Concepts](concepts.md#what-ships-to-the-client).)

> Dev note: editing a `*.server.ts` file makes `bractjs dev` restart itself (module-scope state resets). Editing route files does not.

## 3. A page with a loader

Create `app/routes/notes/_index.tsx` → serves `/notes`:

```tsx
// app/routes/notes/_index.tsx
import { Link, useLoaderData } from "@bractjs/bractjs";
import { listNotes } from "../../notes.server.ts";

export function loader() {
  return { notes: listNotes() };
}

export function meta() {
  return [{ title: "Notes" }];
}

export default function NotesIndex() {
  const { notes } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>Notes</h1>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <Link to="/notes/:id" params={{ id: n.id }}>
              {n.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

The `loader` runs **on the server** for every GET — on the initial document render and again (as JSON, via the internal `/_data` endpoint) when the user soft-navigates with `<Link>`. `useLoaderData<typeof loader>()` infers the data type straight from the loader's return type — no interface to maintain.

## 4. A form with an action and validation

Install a schema library (anything with `.safeParse()` works — Zod, Valibot):

```sh
bun add zod
```

Add a form and an `action` to the same route:

```tsx
// app/routes/notes/_index.tsx — add these imports and exports
import { Form, redirect, safeValidate, useActionData } from "@bractjs/bractjs";
import type { ActionArgs } from "@bractjs/bractjs";
import { z } from "zod";
import { addNote, listNotes } from "../../notes.server.ts";

const NoteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
});

export async function action({ formData }: ActionArgs) {
  const r = await safeValidate(NoteSchema, formData);
  if (!r.ok) return { fieldErrors: r.fieldErrors };
  addNote(r.data.title, r.data.body);
  return redirect("/notes");
}
```

And inside the component:

```tsx
const actionData = useActionData<typeof action>();

<Form method="post">
  <input name="title" placeholder="Title" />
  {actionData?.fieldErrors?.title && <p>{actionData.fieldErrors.title[0]}</p>}
  <textarea name="body" placeholder="Body" />
  {actionData?.fieldErrors?.body && <p>{actionData.fieldErrors.body[0]}</p>}
  <button type="submit">Add note</button>
</Form>;
```

What just happened:

- `<Form method="post">` submits without a full page reload; the `action` runs on the server.
- `safeValidate` returns `{ ok, data, fieldErrors, firstError }` — the clean idiom for inline form errors. (Its sibling `validate()` _throws_ a 400 `Response` instead — handy when any failure should just be a 400.)
- On success the action redirects, and BractJS **automatically revalidates the loaders**, so the new note appears without any manual refetching.
- Cross-site POSTs are rejected with a 403 before your action ever runs — CSRF protection is on by default.

## 5. A dynamic route and a 404

Create `app/routes/notes/[id].tsx` → serves `/notes/:id`:

```tsx
// app/routes/notes/[id].tsx
import type { LoaderArgs, MetaArgs } from "@bractjs/bractjs";
import { HttpError, Link, useLoaderData } from "@bractjs/bractjs";
import { getNote } from "../../notes.server.ts";

export function loader({ params }: LoaderArgs) {
  const note = getNote(params.id as string);
  if (!note) throw new HttpError(404, "No such note");
  return { note };
}

export function meta({ loaderData }: MetaArgs<Awaited<ReturnType<typeof loader>>>) {
  return [{ title: loaderData.note.title }];
}

export default function NoteDetail() {
  const { note } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>{note.title}</h1>
      <p>{note.body}</p>
      <Link to="/notes">← All notes</Link>
    </main>
  );
}
```

Throwing an `HttpError` from a loader is intentional control flow — it renders the 404 page rather than an error boundary. Any _other_ thrown error is caught, sanitized (generic message in production), and rendered by the nearest `ErrorBoundary` export.

Bonus: run `bunx bractjs codegen` and `<Link to>` / `params` become **typed against your actual routes** — a typo'd path or missing param is a compile error. See [§18 Typed routes](../README.md#18-typed-routes).

## 6. A typed API endpoint

Pages aren't the only server surface. Create `app/api/notes.ts`:

```ts
// app/api/notes.ts
import { route } from "@bractjs/bractjs";
import { listNotes } from "../notes.server.ts";

export const apiListNotes = route("GET", "/api/notes", async () => listNotes());
```

**One rule you must know:** endpoints register as a side effect of their module being imported. Import the file from `app/root.tsx`:

```ts
// app/root.tsx — add near the top
import "./api/notes.ts";
```

Without that import the endpoint doesn't exist — not in dev, not in the compiled binary. (If you define a `route()` and forget to register it, `bractjs dev` warns at boot.) Now:

```sh
curl http://localhost:3000/api/notes
```

Mutating `/api` methods get the same CSRF protection as actions, endpoints can carry their own middleware (`route(..., { middleware: [...] })` — important for auth, see the [auth guide](authentication.md)), and `createClient` gives you a fully-typed browser client for them ([§12](../README.md#12-typed-api-routes)).

## 7. Ship it

```sh
bun run build && bun run start     # classic production build
```

or compile everything — your routes, the manifest, the assets — into one executable:

```sh
bun run compile
./my-notes                          # a single file; no node_modules, no app/ dir needed
```

That binary is the whole deployment story: copy it to a server and run it. How it works (and the other rendering modes — SPA, prerendering) is covered in the [deployment guide](deployment.md).

## Where to next

- [Concepts](concepts.md) — the request lifecycle and the three run modes, so the framework stops being magic.
- [Authentication](authentication.md) — before you add login. The scoping rules there are the #1 thing to get right.
- The [README reference](../README.md) — every export, including the ones this tutorial skipped: streaming with `defer`/`<Await>` (§8), server actions (§11), sessions (§15), i18n (§19), image optimization (§20).
