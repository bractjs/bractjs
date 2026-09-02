/**
 * Browser-side HMR client script, embedded as a string and injected by LiveReload.
 *
 * Message types:
 *   hmr:route  — swap a single route module without full page reload
 *   hmr:css    — re-fetch stylesheets in place (no reload, no state loss)
 *   hmr:reload — full page reload (root/layout/non-route file changed)
 *
 * Module swap flow:
 *   1. Receive { type:"hmr:route", pattern, file }
 *   2. Fetch /_hmr/module?file=<file>&t=<now> — server compiles it fresh
 *   3. Call window.__BRACTJS_HMR_ACCEPT__(pattern, module)
 *   4. ClientRouter swaps currentModule → React re-renders <Outlet>
 */
export declare const hmrClientScript: string;
