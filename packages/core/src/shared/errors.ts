export class BractJSError extends Error {
  readonly status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "BractJSError";
    this.status = status;
  }
}

export class HttpError extends BractJSError {
  constructor(status: number, message?: string) {
    super(message ?? httpStatusText(status), status);
    this.name = "HttpError";
  }
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

function httpStatusText(status: number): string {
  const texts: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    503: "Service Unavailable",
  };
  return texts[status] ?? `HTTP Error ${status}`;
}

export { DefaultErrorBoundary, RouteErrorBoundary } from "./error-boundary.tsx";
