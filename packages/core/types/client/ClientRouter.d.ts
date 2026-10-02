import { type ComponentType, type ReactElement, type ReactNode } from "react";
import type { ServerManifest } from "../server/render.ts";
import type { LinkDescriptor, MetaDescriptor } from "../shared/route-types.ts";
import { type RouteModuleClient, type RouteState } from "./router.tsx";
export interface BractJSInitialData extends RouteState {
    manifest: ServerManifest;
    meta?: MetaDescriptor[];
    /** Route `links()` descriptors from the server. */
    links?: LinkDescriptor[];
    /** Present when the document did not SSR the route component (selective SSR / SPA shell). */
    ssrMode?: "client-only" | "data-only" | "spa";
    /** The request id from the requestId() middleware, when registered. */
    requestId?: string;
    /** The page's locale and the app's i18n config (with `i18n` configured). */
    locale?: string;
    i18n?: import("../shared/i18n.ts").I18nConfig;
}
interface ClientRouterProps {
    children: ReactNode;
    initialData: BractJSInitialData;
    initialModule?: RouteModuleClient | null;
    /** The initial route's layout.tsx modules, outermost first. */
    initialLayouts?: Array<RouteModuleClient | null>;
    /** root.tsx's ErrorBoundary export, if any. */
    rootErrorBoundary?: ComponentType<{
        error: unknown;
    }>;
    /** root.tsx's client module (its clientLoader / clientMiddleware run on every navigation). */
    rootModule?: RouteModuleClient | null;
}
/** Import a route's layout.tsx chunks (outermost first); a chunk that fails to load renders nothing. */
export declare function loadLayoutModules(urls: string[] | undefined): Promise<Array<RouteModuleClient | null>>;
export declare function ClientRouter({ children, initialData, initialModule, initialLayouts, rootErrorBoundary, rootModule, }: ClientRouterProps): ReactElement;
export {};
