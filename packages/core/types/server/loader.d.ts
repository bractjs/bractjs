import type { ActionArgs, LoaderArgs, RouteModule } from "../shared/route-types.ts";
import type { ContextFactory } from "./context.ts";
import type { LayoutChain } from "./layout.ts";
import { type OnErrorHook } from "./lifecycle.ts";
export type LoaderResult = unknown | {
    __error: unknown;
} | null;
export interface LoaderResults {
    root: LoaderResult;
    layouts: LoaderResult[];
    route: LoaderResult;
}
export declare function safeRun<T>(fn: ((args: LoaderArgs) => Promise<T> | T) | undefined, args: LoaderArgs, onError?: OnErrorHook, where?: string): Promise<T | {
    __error: unknown;
} | null>;
/**
 * Run the route module's optional `beforeLoad()` export.
 * Returns a Response if beforeLoad wants to short-circuit (redirect / 403),
 * or null to continue normally.
 */
export declare function runBeforeLoad(routeModule: RouteModule, args: LoaderArgs): Promise<Response | null>;
export declare function runLoaders(chain: LayoutChain, args: LoaderArgs, onError?: OnErrorHook): Promise<LoaderResults>;
export declare function runAction(routeModule: RouteModule, args: ActionArgs): Promise<unknown>;
export declare function buildLoaderArgs(request: Request, params: Record<string, string>, context: Record<string, unknown>, search?: Record<string, unknown>): LoaderArgs;
/**
 * If the route module exports a `context` ContextFactory, run its factory and
 * merge the result into a new context object.  Returns the base context as-is
 * if no factory is present.
 */
export declare function runRouteContext(routeModule: RouteModule & {
    context?: ContextFactory<unknown>;
}, request: Request, params: Record<string, string>, baseContext: Record<string, unknown>): Promise<Record<string, unknown>>;
