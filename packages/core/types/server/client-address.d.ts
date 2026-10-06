/** Record the socket address for a request (the server adapter). Not part of the public API. */
export declare function setClientAddress(request: Request, address: string): void;
export interface ClientAddressOptions {
    /**
     * Behind a reverse proxy / load balancer, the socket address is the proxy's.
     * Set this to read the client from `X-Forwarded-For` (or `X-Real-IP`)
     * instead. Only enable it when such a proxy is ALWAYS in front: otherwise
     * any client can claim any address by sending the header.
     *
     * `true` trusts one proxy: the client is the LAST `X-Forwarded-For` entry,
     * the address your proxy saw. Entries before it came from the client and
     * can be anything. With several proxies in a row (a CDN in front of a load
     * balancer), pass their number: `2` takes the second entry from the end.
     */
    trustProxy?: boolean | number;
}
/**
 * The client's IP address, or undefined when unknown (a custom adapter, an
 * in-process test request, or `trustProxy` without the headers).
 */
export declare function getClientAddress(request: Request, options?: ClientAddressOptions): string | undefined;
