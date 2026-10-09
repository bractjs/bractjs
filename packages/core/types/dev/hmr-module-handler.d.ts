/**
 * Dev-only HTTP handler for /_hmr/module?file=routes/about.tsx
 *
 * Compiles the requested route file on-demand (in-memory, no outdir) and
 * returns it as ESM so the browser can dynamically import it for module swap.
 *
 * Security: rejects any path that resolves outside appDir.
 */
export declare function handleHmrModuleRequest(url: URL, appDir: string, 
/** `BractJSConfig.clientEnv`: the `process.env.*` keys the module may inline (as the rebuilder does). */
clientEnv?: string[]): Promise<Response>;
