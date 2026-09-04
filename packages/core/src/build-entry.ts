/**
 * @bractjs/bractjs/build — build-pipeline entry.
 *
 * Programmatic builds (`runBuild`, `runPrerender`) and the bundler plugins for
 * composing your own `Bun.build()` call (native `bun build --compile`, custom
 * client bundles). Everyday app code never needs this entry — it exists so the
 * root import stays focused on routes, loaders, and components.
 *
 * The plugins are REQUIRED when you compose your own `Bun.build`. Missing any
 * of them breaks security or runtime behaviour:
 *
 * - `useClientStubPlugin` (server bundle): replaces "use client" modules with
 *   null stubs. Without it, the server binary crashes when React tries to
 *   call browser-only hooks/APIs.
 * - `createUseServerProxyPlugin(appDir)` (client bundle): replaces
 *   "use server" exports with fetch proxies. Without it, server-action
 *   bodies — including DB queries and secrets — ship inside the browser JS.
 * - `routeShakePlugin(appDir)` (client bundle): dead-code-eliminates the
 *   server-only exports (`loader`, `action`, `headers`, `middleware`) from
 *   route modules, together with imports only they used — the primary
 *   mechanism keeping server code out of route chunks.
 * - `serverModuleStubPlugin` (client bundle): replaces every export of a
 *   `*.server.ts` module with an inert stub — the backstop for server-module
 *   imports that survive shaking (module-level side-effect imports, non-route
 *   client files importing server modules). Stubs keep the import resolvable
 *   while guaranteeing zero server source (DB drivers, secrets) reaches the
 *   browser, and throw if ever used on the client.
 * - `serverOnlyPlugin` (client bundle, legacy): the stricter predecessor that
 *   *hard-fails* any `*.server.ts` import. Kept for back-compat / opt-in use
 *   when you want server-module imports to be a build error rather than a stub.
 * - `clientEnvPlugin(allowedKeys, env)` (client bundle): allowlists which
 *   `process.env.*` references survive into the browser bundle.
 *
 * CSS needs no plugin: Bun extracts stylesheets (including natively scoped
 * `*.module.css`) into real files, and BractJS hashes them and emits the
 * `<link>` tags. `tailwindPlugins` is applied automatically when the config
 * sets `tailwind: true`.
 */
export type { BuildConfig } from "./build/bundler.ts";
export { runBuild } from "./build/bundler.ts";
export { createUseServerProxyPlugin, useClientStubPlugin, useServerProxyPlugin } from "./build/directives.ts";
export { clientEnvPlugin, serverModuleStubPlugin, serverOnlyPlugin } from "./build/env-plugin.ts";
export { routeShakePlugin, SERVER_ONLY_ROUTE_EXPORTS } from "./build/plugins/route-shake.ts";
export { tailwindPlugins } from "./build/plugins/tailwind.ts";
export { collectCssBundles } from "./build/css-collect.ts";
export type { PrerenderOptions, PrerenderResult } from "./build/prerender.ts";
export { runPrerender } from "./build/prerender.ts";
