import type { InstrumentCall, Instrumentation, InstrumentRouteInfo } from "./instrumentation.ts";
import { getRequest } from "./request-context.ts";

// OpenTelemetry tracing on top of instrument(). The app passes its own
// `@opentelemetry/api` (`import * as api from "@opentelemetry/api"`), so core
// never imports it: no dependency, and nothing for a compiled binary to
// resolve. Only the API surface below is used.

interface Span {
  setAttribute(key: string, value: string | number | boolean): unknown;
  setStatus(status: { code: number; message?: string }): unknown;
  recordException(error: unknown): unknown;
  updateName(name: string): unknown;
  end(): void;
}

interface Tracer {
  startSpan(
    name: string,
    options?: { kind?: number; attributes?: Record<string, string | number | boolean> },
    context?: unknown,
  ): Span;
}

/** The parts of `@opentelemetry/api` that `otel()` uses. */
export interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): Tracer;
    setSpan(context: unknown, span: Span): unknown;
  };
  context: {
    active(): unknown;
    with<T>(context: unknown, fn: () => T): T;
  };
  propagation: {
    extract(context: unknown, carrier: Record<string, string>): unknown;
  };
}

export interface OtelOptions {
  /** Tracer name. Default `"bractjs"`. */
  tracerName?: string;
  tracerVersion?: string;
}

// OTel enum values, stable across API versions.
const SPAN_KIND_INTERNAL = 0;
const SPAN_KIND_SERVER = 1;
const STATUS_ERROR = 2;

async function traced(api: OtelApi, span: Span, call: InstrumentCall): Promise<void> {
  const ctx = api.trace.setSpan(api.context.active(), span);
  try {
    // The work runs inside the span's context, so nested spans parent to it.
    const { status, error } = await api.context.with(ctx, call);
    if (status === "error") {
      span.recordException(error);
      span.setStatus({ code: STATUS_ERROR, message: error instanceof Error ? error.message : String(error) });
    }
  } finally {
    span.end();
  }
}

/**
 * OpenTelemetry spans for every request, and for each loader, action and
 * route middleware inside it:
 *
 *   // app/server.ts
 *   import * as api from "@opentelemetry/api";
 *   import { instrument, otel } from "@bractjs/bractjs";
 *   instrument(otel(api));
 *
 * Set up the SDK (exporter, `AsyncLocalStorageContextManager`) before this
 * runs. The request span continues an incoming `traceparent` and is renamed
 * to its route (`GET /blog/:id`) once one matches; a thrown error is recorded
 * on the span where it happened. The response status isn't available to
 * instrumentations, so request spans carry no `http.response.status_code`.
 */
export function otel(api: OtelApi, options: OtelOptions = {}): Instrumentation {
  const tracer = api.trace.getTracer(options.tracerName ?? "bractjs", options.tracerVersion);
  // The request span of the request being handled — route spans rename it, and
  // it isn't always the active span (a loader runs inside middleware spans).
  const requestSpans = new WeakMap<Request, Span>();
  const currentRequestSpan = (): Span | undefined => {
    try {
      return requestSpans.get(getRequest());
    } catch {
      return undefined;
    }
  };

  const routeSpan =
    (kind: "loader" | "action" | "middleware") =>
    async (call: InstrumentCall, info: InstrumentRouteInfo): Promise<void> => {
      const requestSpan = currentRequestSpan();
      if (requestSpan && info.pattern) {
        requestSpan.setAttribute("http.route", info.pattern);
        requestSpan.updateName(`${info.request.method} ${info.pattern}`);
      }
      const span = tracer.startSpan(`${kind} ${info.id}`, {
        kind: SPAN_KIND_INTERNAL,
        attributes: {
          "bractjs.kind": kind,
          "bractjs.route.id": info.id,
          ...(info.pattern ? { "http.route": info.pattern } : {}),
        },
      });
      await traced(api, span, call);
    };

  return {
    async request(call, { request }) {
      const url = new URL(request.url);
      const carrier: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        carrier[key] = value;
      });
      const parent = api.propagation.extract(api.context.active(), carrier);
      const attributes: Record<string, string> = {
        "http.request.method": request.method,
        "url.path": url.pathname,
        "url.scheme": url.protocol.replace(/:$/, ""),
        "server.address": url.hostname,
      };
      const ua = request.headers.get("User-Agent");
      if (ua) attributes["user_agent.original"] = ua;
      // Named by method until a route matches (keeps span names low-cardinality).
      const span = tracer.startSpan(request.method, { kind: SPAN_KIND_SERVER, attributes }, parent);
      requestSpans.set(request, span);
      const ctx = api.trace.setSpan(parent, span);
      await api.context.with(ctx, () => traced(api, span, call));
    },
    loader: routeSpan("loader"),
    action: routeSpan("action"),
    middleware: routeSpan("middleware"),
  };
}
