/** Record the socket address for a request (the server adapter). Not part of the public API. */
export declare function setClientAddress(request: Request, address: string): void;
export interface ClientAddressOptions {
    /**
     * Behind a reverse proxy / load balancer, the socket address is the proxy's.
     * Set this to read the client from `X-Forwarded-For` (first entry) or
     * `X-Real-IP` instead. Only enable it when such a proxy is ALWAYS in front:
     * otherwise any client can claim any address by sending the header.
     */
    trustProxy?: boolean;
}
/**
 * The client's IP address, or undefined when unknown (a custom adapter, an
 * in-process test request, or `trustProxy` without the headers).
 */
export declare function getClientAddress(request: Request, options?: ClientAddressOptions): string | undefined;
