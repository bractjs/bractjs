// The client's network address for a request. `Request` has no remote
// address, so the Bun adapter records the socket's address here as each
// request arrives (server.requestIP), keyed by the Request object itself.
const addresses = new WeakMap<Request, string>();

/** Record the socket address for a request (the server adapter). Not part of the public API. */
export function setClientAddress(request: Request, address: string): void {
  addresses.set(request, address);
}

/**
 * Carry the recorded socket address over to a request the framework derived
 * from `from` (the `/_data` target request, the parsed-form proxy an action
 * receives). Keyed by object identity, the address would otherwise be lost
 * and `getClientAddress()` would answer undefined in loaders and actions.
 * Not part of the public API.
 */
export function inheritClientAddress(from: Request, to: Request): void {
  const address = addresses.get(from);
  if (address !== undefined) addresses.set(to, address);
}

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
export function getClientAddress(request: Request, options: ClientAddressOptions = {}): string | undefined {
  if (options.trustProxy) {
    // SECURITY(high): count from the RIGHT. Proxies append to X-Forwarded-For,
    // so the leftmost entries are whatever the client sent — reading those let
    // anyone pick their address and dodge per-IP rate limits.
    const hops = options.trustProxy === true ? 1 : Math.max(1, Math.floor(Number(options.trustProxy)) || 1);
    const entries = (request.headers.get("X-Forwarded-For") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const forwarded = entries.length >= hops ? entries[entries.length - hops] : undefined;
    return forwarded || request.headers.get("X-Real-IP")?.trim() || undefined;
  }
  return addresses.get(request);
}
