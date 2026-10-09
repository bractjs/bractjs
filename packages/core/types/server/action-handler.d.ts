import { type ActionEntry } from "./action-registry.ts";
import type { ModuleRegistry } from "./layout.ts";
import { type OnErrorHook } from "./lifecycle.ts";
/** Where `/_action` and `/_stream` find the route middleware guarding an action. */
export interface ActionGateOptions {
    appDir: string;
    /** Pre-loaded modules (compiled binary); dev imports from `appDir`. */
    moduleRegistry?: ModuleRegistry;
    /** `false` skips route middleware for actions (`BractJSConfig.actionMiddleware`). */
    routeMiddleware?: boolean;
    /** The request's context from global middleware, shared with route middleware as on pages. */
    context?: Record<string, unknown>;
    /** `BractJSConfig.onError`: told about action failures, as for route actions. */
    onError?: OnErrorHook;
}
/**
 * The response for a gate/action that threw `err`, or null when it is a real
 * failure: a redirect (enveloped), any other thrown `Response` (the intended
 * reply, as on pages and /api), an `HttpError`, or a thrown `data(…, { status })`.
 */
export declare function thrownActionResponse(err: unknown, requestUrl: string): Promise<Response | null>;
/**
 * Run `work` behind the route middleware for `entry` (see
 * `actionMiddlewareChain`). Without `gate` — direct handler calls in tests —
 * or with `routeMiddleware: false`, `work` runs alone. A redirect from the
 * middleware (returned or thrown) becomes the 204 envelope the client proxy
 * follows; an `HttpError` becomes its status.
 */
export declare function runActionGate(request: Request, entry: ActionEntry, gate: ActionGateOptions | undefined, work: () => Promise<Response>): Promise<Response>;
export declare function handleActionRequest(request: Request, gate?: ActionGateOptions): Promise<Response | null>;
