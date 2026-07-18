import { type ReactElement, type ReactNode } from "react";
import type { ServerManifest } from "../server/render.ts";
import type { MetaDescriptor } from "../shared/route-types.ts";
import { type RouteModuleClient, type RouteState } from "./router.tsx";
export interface BractJSInitialData extends RouteState {
    manifest: ServerManifest;
    meta?: MetaDescriptor[];
    /** Present when the document did not SSR the route component (selective SSR / SPA shell). */
    ssrMode?: "client-only" | "data-only" | "spa";
}
interface ClientRouterProps {
    children: ReactNode;
    initialData: BractJSInitialData;
    initialModule?: RouteModuleClient | null;
}
export declare function ClientRouter({ children, initialData, initialModule, }: ClientRouterProps): ReactElement;
export {};
