/** Stable 8-hex fingerprint of a route-pattern set (order-independent). */
export declare function routesFingerprint(patterns: string[]): Promise<string>;
/** Extract the fingerprint hash previously written into a generated file, or null. */
export declare function readFingerprint(src: string | null): string | null;
/**
 * A precise human-readable reason the generated types are stale, or null when
 * fresh. `patterns` must be colon-style (the form the generated file embeds);
 * prefer {@link explainStalenessForApp} which derives them for you.
 */
export declare function explainStaleness(oldSrc: string | null, patterns: string[]): Promise<string | null>;
/** Colon-style route patterns for an app dir (the form the generated file uses). */
export declare function routePatternsForApp(appDir: string): Promise<string[]>;
/** {@link explainStaleness} against the current generated file + route set on disk. */
export declare function explainStalenessForApp(appDir: string, outPath?: string): Promise<string | null>;
export declare function generateRouteTypes(appDir: string): Promise<string>;
export declare function writeRouteTypes(appDir: string, outPath?: string): Promise<{
    dest: string;
    written: boolean;
}>;
