import type { Instrumentation } from "./instrumentation.ts";
interface Span {
    setAttribute(key: string, value: string | number | boolean): unknown;
    setStatus(status: {
        code: number;
        message?: string;
    }): unknown;
    recordException(error: unknown): unknown;
    updateName(name: string): unknown;
    end(): void;
}
interface Tracer {
    startSpan(name: string, options?: {
        kind?: number;
        attributes?: Record<string, string | number | boolean>;
    }, context?: unknown): Span;
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
export declare function otel(api: OtelApi, options?: OtelOptions): Instrumentation;
export {};
