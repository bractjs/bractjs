export type Encoding = "br" | "gzip";
/** Pick the first encoding in `preference` that the client accepts (q > 0). */
export declare function negotiateEncoding(acceptEncoding: string | null, preference?: readonly Encoding[]): Encoding | null;
/** Compress `response` for `request` when both sides allow it; otherwise return it unchanged. */
export declare function compressResponse(request: Request, response: Response): Promise<Response>;
/** Wrap a fetch handler so every response it produces is compressed when the client accepts it. */
export declare function withCompression(handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response>;
/** Test hook: drop cached compressed assets. */
export declare function clearCompressionCache(): void;
