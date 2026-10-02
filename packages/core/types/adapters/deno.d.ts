import type { BractAdapter } from "../server/adapter.ts";
export interface DenoAdapterOptions {
    /** Interface to listen on. Default: all interfaces. */
    hostname?: string;
}
export declare class DenoAdapter implements BractAdapter {
    private handler;
    private server;
    private readonly hostname;
    constructor(options?: DenoAdapterOptions);
    setHandler(handler: (request: Request) => Promise<Response>): void;
    fetch(request: Request): Promise<Response>;
    listen(port: number): void;
    stop(): void;
}
/** `createServer({ adapter: createDenoAdapter() })` — or let createServer pick it on Deno. */
export declare function createDenoAdapter(options?: DenoAdapterOptions): DenoAdapter;
