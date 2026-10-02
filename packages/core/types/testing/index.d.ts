import type { BractJSConfig } from "../server/serve.ts";
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
export declare function createTestApp(options?: TestAppOptions): Promise<TestApp>;
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
export declare function callLoader<T>(loader: (args: never) => T, options?: CallLoaderOptions): T;
export interface CallActionOptions extends CallLoaderOptions {
    /** The submitted fields: a FormData, or a plain object of strings/files. */
    formData?: FormBody;
}
/**
 * Call an action directly, as a form post would: `formData` plus the loader
 * arguments, on a POST request. Works with `defineActions` (pass `intent` in
 * `formData`).
 */
export declare function callAction<T>(action: (args: never) => T, options?: CallActionOptions): T;
