interface RawMap {
    sources: string[];
    sourcesContent?: Array<string | null>;
    mappings: string;
}
export interface OriginalPosition {
    /** Absolute path of the original source. */
    source: string;
    /** 1-based. */
    line: number;
    /** 1-based. */
    column: number;
    /** The source text, when the map embeds it. */
    content?: string;
}
/** The inline source map of a built JS file, or null. */
export declare function readInlineSourceMap(code: string): RawMap | null;
/**
 * The original position of generated `line`:`column` (1-based) — the last
 * mapping at or before the column on that line. Null when unmapped.
 */
export declare function originalPositionFor(map: RawMap, line: number, column: number): {
    sourceIndex: number;
    line: number;
    column: number;
} | null;
/**
 * Map `line`:`column` of the built file at `chunkPath` to its source. Bun
 * writes `sources` relative to the build's output root (`outRoot`); a path
 * relative to the chunk itself is tried too.
 */
export declare function mapChunkPosition(chunkPath: string, outRoot: string, line: number, column: number): OriginalPosition | null;
export {};
