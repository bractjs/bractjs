/** Sent by prerendering: "tell me if this page is an ISR page". */
export declare const PRERENDER_HEADER = "X-BractJS-Prerender";
/** The handler's answer: the route's `config.revalidate`, in seconds. */
export declare const REVALIDATE_HEADER = "X-BractJS-Revalidate";
/** Marks the server's own regeneration requests (with a per-process secret), which must skip the cache. */
export declare const ISR_REGEN_HEADER = "X-BractJS-ISR-Regenerate";
/** Under `<buildDir>/client/_prerender/`. */
export declare const ISR_MANIFEST = "_isr.json";
export interface IsrManifest {
    /** When the build rendered the pages (ms since epoch). */
    generatedAt: number;
    /** Prerendered path → revalidate seconds. */
    routes: Record<string, number>;
}
/** Validate a route's `config.revalidate` (seconds). */
export declare function parseRevalidate(value: unknown, path: string): number;
export interface IsrOptions {
    /** Read a build-time file under `_prerender/` (embedded or on disk); null when absent. */
    load(rel: string): Promise<string | null>;
    /** Render `path` fresh, bypassing the prerender cache: the document and its `/_data` payload. */
    render(path: string): Promise<{
        html: Response;
        data: Response;
    }>;
    now?: () => number;
}
export interface Isr {
    /** The ISR response for a document (`kind: "html"`) or `/_data` request, or null when `path` isn't an ISR page. */
    serve(path: string, kind: "html" | "data"): Promise<Response | null>;
    /** Regenerate `path` now. Resolves false when it isn't an ISR page or rendering failed. */
    revalidate(path: string): Promise<boolean>;
}
/** `/about/` → `/about`; `/` stays. */
export declare function normalizeIsrPath(path: string): string;
export declare function createIsr(options: IsrOptions): Isr;
/**
 * Regenerate a prerendered ISR page now (route `config.revalidate`) — e.g.
 * from an action after the content behind it changed. Resolves true when a
 * fresh copy was rendered. Works on this server process only.
 */
export declare function revalidatePath(path: string): Promise<boolean>;
