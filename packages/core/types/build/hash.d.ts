/** SHA-256 of file contents → first 8 hex chars. */
export declare function contentHash(filePath: string): Promise<string>;
/** SHA-256 of a string → first 8 hex chars. */
export declare function hashString(content: string): Promise<string>;
/**
 * Inserts the content hash before the file extension.
 * Example: client.js → client.abc12345.js
 * Returns the new path (does NOT rename on disk).
 */
export declare function renameWithHash(filePath: string): Promise<string>;
