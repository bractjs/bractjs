// The client's network address for a request. `Request` has no remote
// address, so the Bun adapter records the socket's address here as each
// request arrives (server.requestIP), keyed by the Request object itself.
const addresses = new WeakMap<Request, string>();

/** Record the socket address for a request (the server adapter). Not part of the public API. */
export function setClientAddress(request: Request, address: string): void {
  addresses.set(request, address);
}

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
export function getClientAddress(request: Request, options: ClientAddressOptions = {}): string | undefined {
  if (options.trustProxy) {
    const forwarded = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
    return forwarded || request.headers.get("X-Real-IP")?.trim() || undefined;
  }
  return addresses.get(request);
}
