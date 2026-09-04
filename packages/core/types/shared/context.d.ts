import { type ComponentType, type ReactNode } from "react";
import type { RouteMatch, RouterLocation } from "./route-types.ts";
export interface RouteManifest {
    [routeId: string]: {
        file: string;
        imports?: string[];
    };
}
export interface BractJSContextValue {
    loaderData: Record<string, unknown>;
    actionData: unknown;
    params: Record<string, string>;
    pathname: string;
    manifest: RouteManifest;
    /** SSR-only: the matched route's default export so <Outlet> can render it without ClientRouter */
    RouteComponent?: ComponentType;
    /** The request's location, so `useLocation()` works during SSR (hash is always ""). */
    location?: RouterLocation;
    /** Validated search params (route `searchSchema` output), so `useSearch()` works during SSR. */
    search?: Record<string, unknown>;
    /** The matched route chain (root → layouts → route) for `useMatches()`. */
    matches?: RouteMatch[];
}
export declare const BractJSContext: import("react").Context<BractJSContextValue>;
interface BractJSProviderProps {
    value: BractJSContextValue;
    children: ReactNode;
}
export declare function BractJSProvider({ value, children }: BractJSProviderProps): import("react").FunctionComponentElement<import("react").ProviderProps<BractJSContextValue>>;
export declare function useBractJSContext(): BractJSContextValue;
export {};
