/** Whether `path` is an existing file. */
export declare function fileExists(path: string): Promise<boolean>;
/** A file's contents as text (throws when missing). */
export declare function readText(path: string): Promise<string>;
/** A file as a response body with its content type, or null when it isn't a file. */
export declare function fileBody(path: string): Promise<{
    body: BodyInit;
    type: string;
    size?: number;
} | null>;
/** Content type by file extension (what Bun.file infers), for runtimes without it. */
export declare function contentTypeFor(path: string): string;
