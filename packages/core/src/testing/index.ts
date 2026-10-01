import { buildLoaderArgs } from "../server/loader.ts";
import type { BractJSConfig } from "../server/serve.ts";
import { buildFetchHandler } from "../server/serve.ts";
import type { ActionArgs, LoaderArgs } from "../shared/route-types.ts";

// Test helpers for BractJS apps: drive the real request pipeline (global
// middleware, route middleware, beforeLoad, loaders, actions, SSR) without a
// server or a build, or call one loader/action directly with realistic args.

export interface TestAppOptions extends Partial<BractJSConfig> {
  /**
   * Import `<appDir>/server.ts` first, so its `pipeline.use(...)` global
   * middleware runs on test requests — as under `bractjs dev` / `start`.
   * Default true.
   */
  serverEntry?: boolean;
  /** The origin requests come from (and the CSRF gate checks). Default `http://localhost`. */
  origin?: string;
}

export interface TestApp {
  /** Send a request (a path is resolved against the origin). Cookies from earlier responses are sent along. */
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
  /** GET a document (or any URL). */
  get(path: string, init?: RequestInit): Promise<Response>;
  /**
   * POST like a browser form without JavaScript: the route's action runs and
   * the response is the re-rendered document or the action's redirect.
   * A plain object becomes form fields.
   */
  post(path: string, body?: FormBody, init?: RequestInit): Promise<Response>;
  /**
   * POST like `<Form>` / `useSubmit()` after hydration: the response is the
   * action's JSON (or `204` + `X-BractJS-Redirect` for a redirect).
   */
  submit(path: string, body?: FormBody, init?: RequestInit): Promise<Response>;
  /** The `/_data` payload a client navigation to `path` would receive. */
  data<T = Record<string, unknown>>(path: string): Promise<T>;
  /** The cookie jar: name → value, updated from every `Set-Cookie`. */
  readonly cookies: Map<string, string>;
}

/** Form fields: a FormData, or a plain object of strings/files. */
export type FormBody = FormData | Record<string, string | Blob>;

/**
 * Run an app's real request pipeline in-process, from source, with no build
 * and no listening server.
 *
 * ```ts
 * const app = await createTestApp();
 * const res = await app.get("/posts/1");
 * expect(res.status).toBe(200);
 * expect(await res.text()).toContain("<h1>Hello</h1>");
 * ```
 *
 * Run tests from the app root (or pass `appDir`). Client scripts aren't built,
 * so documents reference a placeholder client entry — assert on the HTML.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const { serverEntry = true, origin = "http://localhost", ...config } = options;
  const appDir = config.appDir ?? "./app";
  if (serverEntry) {
    // Runtime plugins (CSS Modules, "use client" stubs) are installed by
    // loadServerEntry too, before any app module loads.
    const { loadServerEntry } = await import("../config/server-entry.ts");
    const entry = await loadServerEntry(appDir);
    if (entry.error) throw entry.error;
  }
  const handler = buildFetchHandler({
    ...config,
    appDir,
    // No build in tests: a stub manifest instead of reading build/.
    manifest: config.manifest ?? { clientEntry: "/build/client/client.js", routes: {} },
  });

  const cookies = new Map<string, string>();

  async function send(input: string | Request, init?: RequestInit): Promise<Response> {
    const request = typeof input === "string" ? new Request(new URL(input, origin), init) : input;
    const headers = new Headers(request.headers);
    if (cookies.size > 0 && !headers.has("Cookie")) {
      headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    // Same-origin, like a browser — mutations pass the CSRF gate.
    if (request.method !== "GET" && request.method !== "HEAD" && !headers.has("Origin")) {
      headers.set("Origin", origin);
    }
    const res = await handler(new Request(request, { headers }));
    storeCookies(cookies, res.headers);
    return res;
  }

  return {
    fetch: send,
    get: (path, init) => send(path, { ...init, method: "GET" }),
    post: (path, body, init) => send(path, { ...init, method: "POST", body: toFormData(body) }),
    submit: (path, body, init) => {
      const headers = new Headers(init?.headers);
      headers.set("X-BractJS-Action", "1");
      return send(path, { ...init, method: "POST", headers, body: toFormData(body) });
    },
    async data<T>(path: string): Promise<T> {
      const res = await send(`/_data?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`[bractjs/testing] /_data for ${path} answered ${res.status}`);
      return (await res.json()) as T;
    },
    cookies,
  };
}

export interface CallLoaderOptions {
  /** Route params (`{ id: "42" }` for `routes/[id].tsx`). */
  params?: Record<string, string>;
  /** The request URL. Default `http://localhost/`. */
  url?: string;
  /** A full request instead of `url` (headers, cookies…). */
  request?: Request;
  /** Values middleware would have put on `context`. */
  context?: Record<string, unknown>;
  /** The validated `search` object (what a route's `searchSchema` would produce). */
  search?: Record<string, unknown>;
}

/**
 * Call a loader directly with the arguments BractJS would pass — `request`,
 * `url`, `params`, a typed `context` and `search`. Returns what the loader
 * returns; a thrown `redirect()` / `HttpError` propagates, so assert on it
 * with `expect(…).rejects`.
 */
export function callLoader<T>(loader: (args: never) => T, options: CallLoaderOptions = {}): T {
  const request = options.request ?? new Request(options.url ?? "http://localhost/");
  const args: LoaderArgs = buildLoaderArgs(
    request,
    options.params ?? {},
    options.context ?? {},
    options.search ?? {},
  );
  // `never` above accepts any loader signature (e.g. LoaderArgs<MySearch>).
  return (loader as (args: LoaderArgs) => T)(args);
}

export interface CallActionOptions extends CallLoaderOptions {
  /** The submitted fields: a FormData, or a plain object of strings/files. */
  formData?: FormBody;
}

/**
 * Call an action directly, as a form post would: `formData` plus the loader
 * arguments, on a POST request. Works with `defineActions` (pass `intent` in
 * `formData`).
 */
export function callAction<T>(action: (args: never) => T, options: CallActionOptions = {}): T {
  const formData = toFormData(options.formData) ?? new FormData();
  const request =
    options.request ?? new Request(options.url ?? "http://localhost/", { method: "POST", body: formData });
  const args = buildLoaderArgs(request, options.params ?? {}, options.context ?? {}, options.search ?? {});
  return (action as (args: ActionArgs) => T)({ ...args, formData });
}

function toFormData(body: FormBody | undefined): FormData | undefined {
  if (body === undefined || body instanceof FormData) return body;
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.append(key, value);
  return form;
}

function storeCookies(jar: Map<string, string>, headers: Headers): void {
  for (const line of headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => {
      const [k, v = ""] = a.trim().split("=");
      const key = k.toLowerCase();
      return (key === "max-age" && Number(v) <= 0) || (key === "expires" && Date.parse(v) <= Date.now());
    });
    if (expired || value === "") jar.delete(name);
    else jar.set(name, value);
  }
}
