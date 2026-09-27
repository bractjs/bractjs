/**
 * Dev-server Host allowlist (DNS-rebinding guard).
 *
 * SECURITY(medium): the dev server serves source-derived endpoints
 * (/_hmr/module compiles any appDir .ts/.tsx on demand, error responses carry
 * messages). A malicious page can re-point its own domain at 127.0.0.1 (DNS
 * rebinding) and read those responses same-origin, because the browser still
 * sends `Host: evil.example`. Rejecting unknown Host *names* closes that:
 * rebinding only works through a domain name, so loopback names and IP
 * literals are always safe to accept (the same rule Vite applies).
 */
export function isAllowedDevHost(hostHeader: string | null, allowedHosts: readonly string[] = []): boolean {
  // No Host header: not a browser request (HTTP/1.1 browsers always send one).
  if (!hostHeader) return true;
  const hostname = hostnameOf(hostHeader);
  if (hostname === null) return false;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (isIpLiteral(hostname)) return true;
  for (const entry of allowedHosts) {
    const e = entry.toLowerCase();
    // Leading dot = the domain and all its subdomains (".example.test").
    if (e.startsWith(".") ? hostname === e.slice(1) || hostname.endsWith(e) : hostname === e) return true;
  }
  return false;
}

function hostnameOf(hostHeader: string): string | null {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isIpLiteral(hostname: string): boolean {
  // URL() normalizes IPv4 (incl. shorthand/hex forms) to dotted quads and keeps
  // IPv6 bracketed, so these two shapes cover every literal it can produce.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || (hostname.startsWith("[") && hostname.endsWith("]"));
}
