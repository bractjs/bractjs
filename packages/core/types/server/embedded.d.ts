/** The embedded copy of `rel` inside directory `dir` (e.g. `build/client`, `app/root.abc.css`), if any. */
export declare function embeddedFile(dir: string, rel: string): Blob | undefined;
/** Test seam: forget the cached index. */
export declare function _resetEmbeddedIndex(files?: Map<string, Blob>): void;
