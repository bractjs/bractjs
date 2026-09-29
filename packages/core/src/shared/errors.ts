export class BractJSError extends Error {
  readonly status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "BractJSError";
    this.status = status;
  }
}

export class HttpError extends BractJSError {
  /** Standard reason phrase for `status` (React Router `ErrorResponse.statusText`). */
  readonly statusText: string;
  /** The error payload (React Router `ErrorResponse.data`) — the message unless a richer value was thrown. */
  data: unknown;
  /** Always false: this error came from app code, not a router-internal 404/405. */
  readonly internal = false;

  constructor(status: number, message?: string) {
    super(message ?? httpStatusText(status), status);
    this.name = "HttpError";
    this.statusText = httpStatusText(status);
    this.data = this.message;
  }
}

/**
 * React Router's `isRouteErrorResponse`: true for an error that carries an
 * HTTP status — a thrown `HttpError`, `data(…, { status })`, or
 * `new Response(…, { status })` (all normalized to `HttpError`), or any
 * object with React Router's `ErrorResponse` shape.
 */
export function isRouteErrorResponse(value: unknown): value is HttpError {
  if (value instanceof HttpError) return true;
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "number" && typeof v.statusText === "string" && "data" in v && "internal" in v;
}

export function isRedirect(value: unknown): value is Response {
  return value instanceof Response && value.status >= 300 && value.status < 400;
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

export function isBractJSError(value: unknown): value is BractJSError {
  return value instanceof BractJSError;
}

export function httpStatusText(status: number): string {
  const texts: Record<number, string> = {
    400: "Bad Request",
    402: "Payment Required",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    409: "Conflict",
    410: "Gone",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return texts[status] ?? `HTTP Error ${status}`;
}

export { DefaultErrorBoundary, RouteErrorBoundary } from "./error-boundary.tsx";
