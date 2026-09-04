import { type ReactNode } from "react";
import type { MetaDescriptor, RouteMatch } from "../shared/route-types.ts";
export interface ServerManifest {
    clientEntry: string;
    rootChunk?: string;
    /** CSS reachable from the client entry — linked on every document. */
    entryCss?: string[];
    /** CSS imported by `app/root.tsx` — linked on every document. */
    rootCss?: string[];
    routes: Record<string, {
        file: string;
        chunk?: string;
        imports?: string[];
        css?: string[];
    }>;
}
export interface RenderOptions {
    shell: ReactNode;
    loaderData: Record<string, unknown>;
    actionData: unknown;
    params: Record<string, string>;
    pathname: string;
    /** Validated search params — hydrates `useSearch()` so the client never re-validates. */
    search?: Record<string, unknown>;
    manifest: ServerManifest;
    meta: MetaDescriptor[];
    /** The matched route chain (root → layouts → route) for `useMatches()`. */
    matches?: RouteMatch[];
    status?: number;
    /** Path of the matched route file (e.g. "routes/_index.tsx"), used by the client to pre-import the module before hydration. */
    routeFile?: string;
    /**
     * URL pattern of the matched route (the manifest key), used to link that
     * route's extracted CSS. Omitted for the SPA shell, which has no matched
     * route — the client links route CSS once it resolves one.
     */
    routePattern?: string;
    /** Per-request CSP nonce (set by the opt-in `csp()` middleware). Applied to the inline bootstrap script + client entry module tags. */
    nonce?: string;
    /**
     * Set when the document did NOT SSR the route component: the client renders
     * the Fallback during hydration, then swaps in the real component
     * ("data-only": data already present; "client-only": after a /_data fetch;
     * "spa": static shell, everything resolved client-side).
     */
    ssrMode?: "client-only" | "data-only" | "spa";
    /**
     * Resolved route `headers()` output (root → layout → route merged). Applied
     * on top of the baseline document headers, overriding any same-key default.
     */
    headers?: Headers | null;
}
export declare function renderRoute(options: RenderOptions): Promise<Response>;
