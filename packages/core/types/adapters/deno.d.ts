import { type BractAdapter } from "../server/adapter.ts";
export interface DenoAdapterOptions {
    /** Interface to listen on. Default: all interfaces. */
    hostname?: string;
    /** Reject request bodies larger than this many bytes (413). Default 16 MiB, as on Bun. */
    maxRequestBodySize?: number;
}
export declare class DenoAdapter implements BractAdapter {
    private handler;
    private server;
    private readonly hostname;
    private readonly maxBody;
    constructor(options?: DenoAdapterOptions);
    setHandler(handler: (request: Request) => Promise<Response>): void;
    fetch(request: Request): Promise<Response>;
    listen(port: number): void;
    stop(): void;
}
/** `createServer({ adapter: createDenoAdapter() })` — or let createServer pick it on Deno. */
export declare function createDenoAdapter(options?: DenoAdapterOptions): DenoAdapter;
