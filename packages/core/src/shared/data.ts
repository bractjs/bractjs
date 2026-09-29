import { HttpError } from "./errors.ts";

// React Router's `data(value, init)` — loader/action data that carries a status
// and headers without becoming a Response. The value is what the component
// receives; the init is applied to the HTTP response:
//   - loader: a 4xx/5xx `status` on the leaf route sets the document status;
//     `headers` reach the route's `headers()` export as `loaderHeaders`.
//   - action: `status` + `headers` are applied to the action response (JSON for
//     client submits, the re-rendered document for no-JS posts).
// Thrown, it is an error response: `throw data("No such post", { status: 404 })`
// renders the ErrorBoundary exactly like `throw new HttpError(404, …)`.

const BRAND = Symbol.for("bractjs.DataWithResponseInit");

export class DataWithResponseInit<T> {
  readonly type = "DataWithResponseInit" as const;
  readonly [BRAND] = true;
  constructor(
    readonly data: T,
    readonly init: ResponseInit | null,
  ) {}
}

/** Return (or throw) loader/action data with a status and/or headers. */
export function data<T>(value: T, init?: number | ResponseInit): DataWithResponseInit<T> {
  return new DataWithResponseInit(value, typeof init === "number" ? { status: init } : (init ?? null));
}

export function isDataWithResponseInit(value: unknown): value is DataWithResponseInit<unknown> {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[BRAND] === true;
}

/** Longest error body copied into an error message from a thrown Response. */
const MAX_ERROR_BODY = 1024;

/**
 * Normalize React Router's thrown error responses into an {@link HttpError}:
 * `throw new Response("Not Found", { status: 404 })` and
 * `throw data("Not Found", { status: 404 })`. Returns null for anything else
 * (including redirects — those stay control flow).
 */
export async function toHttpError(err: unknown): Promise<HttpError | null> {
  if (err instanceof Response) {
    if (err.status < 400) return null;
    let body = "";
    try {
      body = (await err.text()).slice(0, MAX_ERROR_BODY);
    } catch {
      /* unreadable body → default status text */
    }
    return new HttpError(err.status, body || err.statusText || undefined);
  }
  if (isDataWithResponseInit(err)) {
    const status = err.init?.status ?? 500;
    const message = typeof err.data === "string" ? err.data : undefined;
    const e = new HttpError(status, message);
    if (typeof err.data !== "string") (e as { data: unknown }).data = err.data;
    return e;
  }
  return null;
}
