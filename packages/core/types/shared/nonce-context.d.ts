/**
 * Per-request CSP nonce, provided by the SSR render pipeline when the opt-in
 * csp() middleware ran. Lets framework components that emit inline <script>
 * (currently <LiveReload>) carry the nonce, so 'strict-dynamic' trust flows to
 * the chunks they import. Undefined on the client and when CSP is off.
 */
export declare const CspNonceContext: import("react").Context<string | undefined>;
