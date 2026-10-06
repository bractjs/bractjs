import { type ActionEntry } from "./action-registry.ts";
import type { ModuleRegistry } from "./layout.ts";
/** Where `/_action` and `/_stream` find the route middleware guarding an action. */
export interface ActionGateOptions {
    appDir: string;
    /** Pre-loaded modules (compiled binary); dev imports from `appDir`. */
    moduleRegistry?: ModuleRegistry;
    /** `false` skips route middleware for actions (`BractJSConfig.actionMiddleware`). */
    routeMiddleware?: boolean;
}
/**
 * Run `work` behind the route middleware for `entry` (see
 * `actionMiddlewareChain`). Without `gate` — direct handler calls in tests —
 * or with `routeMiddleware: false`, `work` runs alone. A redirect from the
 * middleware (returned or thrown) becomes the 204 envelope the client proxy
 * follows; an `HttpError` becomes its status.
 */
export declare function runActionGate(request: Request, entry: ActionEntry, gate: ActionGateOptions | undefined, work: () => Promise<Response>): Promise<Response>;
export declare function handleActionRequest(request: Request, gate?: ActionGateOptions): Promise<Response | null>;
