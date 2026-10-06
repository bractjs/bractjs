import { type ComponentType, type ReactNode } from "react";
import type { I18nConfig } from "../shared/i18n.ts";
import type { LinkDescriptor, MetaDescriptor, RouteMatch } from "../shared/route-types.ts";
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
        /** Layout chunk URLs, outermost → innermost — the client loads them to render the same tree. */
        layouts?: string[];
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
    /** Route `links()` descriptors (root → layouts → route), rendered into `<head>`. */
    links?: LinkDescriptor[];
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
    /**
     * Abort the React render and fail still-pending `defer()` data after this
     * many ms (React Router's `streamTimeout`). Unset → no limit.
     */
    streamTimeout?: number;
    /** The page's locale and the app's i18n config, for the client router. */
    locale?: string;
    i18n?: I18nConfig;
}
export declare function renderRoute(options: RenderOptions): Promise<Response>;
/**
 * The hardening headers every document gets (nosniff, framing, referrer) —
 * SSR documents here, and prerendered / ISR pages in serve.ts, so a static
 * page isn't frameable where its SSR twin isn't.
 */
export declare const DOCUMENT_SECURITY_HEADERS: Readonly<Record<string, string>>;
export interface RootErrorDocumentOptions {
    /** root.tsx's ErrorBoundary, else the built-in fallback. */
    Boundary: ComponentType<{
        error: unknown;
    }>;
    /** root.tsx's `Layout` export: when present, it renders the document around the boundary. */
    Layout?: ComponentType<{
        children?: ReactNode;
    }>;
    error: Error;
    params: Record<string, string>;
    pathname?: string;
    search?: string;
    manifest: ServerManifest;
    nonce?: string;
    status: number;
    locale?: string;
    i18n?: I18nConfig;
}
/**
 * The document for a failed root loader. root.tsx renders `<html>` itself and
 * needs its loader data to do so, so the framework owns this document: root's
 * `Layout` (or a minimal `<html>`), the app-wide stylesheets and root's
 * ErrorBoundary (shared/root-error-document.tsx). It ships the client entry,
 * which hydrates the same tree — the boundary's buttons and effects work, and
 * links are document loads that retry the app.
 */
export declare function renderRootErrorDocument(options: RootErrorDocumentOptions): Promise<Response>;
