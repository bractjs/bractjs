import type { BractAdapter } from "../server/adapter.ts";
export interface NodeAdapterOptions {
    /** Interface to listen on. Default: all interfaces. */
    hostname?: string;
    /** Reject request bodies larger than this many bytes (413). Default 16 MiB, as on Bun. */
    maxRequestBodySize?: number;
}
export declare class NodeAdapter implements BractAdapter {
    private handler;
    private server;
    private readonly hostname;
    private readonly maxBody;
    constructor(options?: NodeAdapterOptions);
    setHandler(handler: (request: Request) => Promise<Response>): void;
    fetch(request: Request): Promise<Response>;
    listen(port: number): void;
    stop(): void;
    private respond;
}
/** `createServer({ adapter: createNodeAdapter() })` — or let createServer pick it on Node. */
export declare function createNodeAdapter(options?: NodeAdapterOptions): NodeAdapter;
