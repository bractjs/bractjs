# Testing your app

BractJS apps test with `bun test`. `@bractjs/bractjs/testing` gives you two levels:

- **`createTestApp()`** runs the app's real request pipeline in-process: global middleware from `app/server.ts`, route middleware, `beforeLoad`, loaders, actions, server actions and SSR. It needs no build and no listening port. Use it for "this page renders", "this form saves", "this route is protected".
- **`callLoader()` / `callAction()`** call one route function with the arguments BractJS would pass. Use them for focused logic tests.

Plain `*.server.ts` modules (your data layer) need nothing special: import and call them.

`examples/todo/app/__tests__/board.test.ts` uses all three.

## Setup

Add a test script and put tests anywhere under `app/` (or a top-level `tests/`):

```json
{ "scripts": { "test": "bun test app" } }
```

Run tests from the app root: `createTestApp()` looks for `./app` (pass `appDir` otherwise). Scaffolded apps (`bractjs new`) come with this script and a sample test.

## Whole requests: `createTestApp()`

```ts
import { expect, test } from "bun:test";
import { createTestApp } from "@bractjs/bractjs/testing";

const app = await createTestApp();

test("the post page renders", async () => {
  const res = await app.get("/posts/hello-world");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<h1>Hello, world</h1>");
});

test("unknown posts are a 404", async () => {
  const res = await app.get("/posts/nope");
  expect(res.status).toBe(404);
});
```

| Method                       | Sends                                                          | You get back                                                                 |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `app.get(path)`              | a document GET                                                 | the HTML `Response` (status, headers, body)                                  |
| `app.data(path)`             | the `/_data` request a client navigation makes                 | the parsed payload: `{ root, layouts, route, meta, … }`. Throws on a non-2xx |
| `app.submit(path, fields)`   | a POST like `<Form>` / `useSubmit()` after hydration           | the action's JSON, or `204` + `X-BractJS-Redirect` when it redirects         |
| `app.post(path, fields)`     | a POST like a form without JavaScript                          | the re-rendered document, or the action's real `3xx`                         |
| `app.fetch(path \| Request)` | anything else: `/api` routes, custom headers, `/_action` calls | the raw `Response`                                                           |

Details that keep tests honest:

- **Fields** are a `FormData` or a plain object (`{ intent: "add", title: "x" }`). `defineActions` routes take their `intent` from the fields.
- **Cookies** persist. Every `Set-Cookie` lands in `app.cookies` (a `Map`) and is sent on later requests, so "log in, then load the dashboard" works. Set a cookie by hand with `app.cookies.set("session", value)`.
- **CSRF** passes: mutations carry a same-origin `Origin` header, like a browser. To test the gate itself, send a different `Origin` through `app.fetch`.
- **Redirects aren't followed.** Assert on `res.status` and `res.headers.get("Location")`.
- **No client build.** Documents link a placeholder client entry, and styles aren't compiled. Assert on HTML, not on hydration. The browser end-to-end tests cover hydration and styling (see the repo's `e2e/`).
- **Global middleware.** `createTestApp()` imports `app/server.ts` for its `pipeline.use(...)` middleware, as `bractjs dev` and `start` do. Pass `{ serverEntry: false }` to skip it.
- **State is shared.** One `createTestApp()` per file is the usual shape, and its data persists across that file's tests, like a running server. Give each test its own records, or reset your store in `beforeEach`.

### Testing auth

```ts
test("the dashboard requires a session", async () => {
  const app = await createTestApp();
  const res = await app.get("/dashboard");
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("/login");

  await app.post("/login", { email: "ada@example.com", password: "correct horse" });
  expect(app.cookies.has("__session")).toBe(true);
  expect((await app.get("/dashboard")).status).toBe(200);
});
```

Remember that route middleware doesn't cover `/api` or server actions ([Authentication](authentication.md)). Test those endpoints directly with `app.fetch`.

## One function: `callLoader()` / `callAction()`

```ts
import { expect, test } from "bun:test";
import { callAction, callLoader } from "@bractjs/bractjs/testing";
import { action, loader } from "../routes/posts/[id].tsx";

test("the loader reads the id param", async () => {
  const data = await callLoader(loader, { params: { id: "42" } });
  expect(data.post.id).toBe("42");
});

test("the action validates the title", async () => {
  const result = await callAction(action, { params: { id: "42" }, formData: { title: "" } });
  expect(result).toEqual({ error: "Title is required." });
});

test("missing posts throw a 404", async () => {
  await expect(callLoader(loader, { params: { id: "nope" } })).rejects.toMatchObject({ status: 404 });
});
```

Options: `params`, `url` (or a full `request`), `context` (what middleware would have put there; `context.get()`/`set()` work), `search` (the validated `searchSchema` output), and for actions `formData`. A thrown `redirect()` or `HttpError` propagates, so assert with `rejects`.

These skip middleware, `beforeLoad` and `searchSchema`. When those matter, use `createTestApp()`.

## Server actions

A `"use server"` function is a plain async function on the server, so import and call it:

```ts
import { renameTask } from "../actions.server.ts";

test("rename validates", async () => {
  const form = new FormData();
  form.set("id", "1");
  form.set("title", "");
  expect(await renameTask(null, form)).toEqual({ error: "Please add a task title." });
});
```

If the action calls `getRequest()`, call it through the pipeline instead (`app.fetch("/_action?id=…")`) or test the helpers it delegates to.
