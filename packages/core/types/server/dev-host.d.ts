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
export declare function isAllowedDevHost(hostHeader: string | null, allowedHosts?: readonly string[]): boolean;
