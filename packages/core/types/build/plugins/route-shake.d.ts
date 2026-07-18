import type { BunPlugin } from "bun";
/**
 * Route-module exports that only ever run on the server. Client bundles strip
 * them — bodies AND the imports that become unused — so server-only code (DB
 * drivers, secrets, fs access) never ships to the browser and route chunks
 * shrink to their component + client hooks. `beforeLoad`, `clientLoader`,
 * `clientAction`, and `searchSchema` are NOT stripped: they run client-side.
 */
export declare const SERVER_ONLY_ROUTE_EXPORTS: readonly ["loader", "action", "headers", "middleware"];
/**
 * Client-bundle plugin: dead-code-eliminate the server-only exports from
 * route modules (`<appDir>/routes/**` and `root.tsx`). This makes stripping —
 * not stubbing — the primary protection for route-module server code;
 * `serverModuleStubPlugin` stays in the build as the backstop for
 * `*.server.ts` imports that survive (e.g. module-level side-effect imports).
 *
 * Ordering: register AFTER `createUseServerProxyPlugin` — a whole-module
 * `"use server"` file must become fetch proxies, never be shaken (the
 * directive check below is defense in depth for that case).
 */
export declare function routeShakePlugin(appDir: string): BunPlugin;
/**
 * Transform one route module's source: eliminate the server-only exports and
 * trim imports that only they used. Exposed for tests and the dev HMR module
 * handler; `transpiler` must be configured as in {@link routeShakePlugin}.
 *
 * The standalone transpiler always emits the DEV automatic-JSX runtime, whose
 * production export (`jsxDEV`) is `void 0` — importing it in a production
 * bundle would crash at render. Outside development we rewrite to the
 * production runtime: `jsx` ignores `jsxDEV`'s extra arguments and the
 * jsx/jsxs distinction only affects dev-time key warnings, so the swap is
 * behavior-preserving.
 */
export declare function shakeRouteModuleSource(src: string, transpiler: Bun.Transpiler): string;
