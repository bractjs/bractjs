import type { BunPlugin } from "bun";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { hasServerDirective } from "../../shared/directives.ts";
import { rewriteClientEnv } from "../env-plugin.ts";

/**
 * Route-module exports that only ever run on the server. Client bundles strip
 * them — bodies AND the imports that become unused — so server-only code (DB
 * drivers, secrets, fs access) never ships to the browser and route chunks
 * shrink to their component + client hooks. `beforeLoad`, `clientLoader`,
 * `clientAction`, and `searchSchema` are NOT stripped: they run client-side.
 */
export const SERVER_ONLY_ROUTE_EXPORTS = [
  "loader",
  "action",
  "headers",
  "middleware",
  // React Router 7.3–7.8 middleware name.
  "unstable_middleware",
  // Evaluated on the server; the payload carries the resulting descriptors.
  "links",
] as const;

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
export interface RouteShakeOptions {
  /**
   * Emit the production JSX runtime. The client bundle always defines
   * `process.env.NODE_ENV = "production"`, under which React's dev runtime
   * export (`jsxDEV`) is `undefined` — so this must follow the BUNDLE's mode,
   * not the build process's NODE_ENV (`NODE_ENV=test bractjs build` in CI).
   * Default: `process.env.NODE_ENV === "production"`.
   */
  production?: boolean;
  /**
   * Apply the `process.env.*` client allowlist rewrite to the shaken source.
   * Bun uses the first onLoad that answers, so `clientEnvPlugin` never sees
   * the route modules this plugin loads; pass its arguments here instead.
   */
  env?: { allowedKeys: string[]; values: Record<string, string> };
}

export function routeShakePlugin(appDir: string, options: RouteShakeOptions = {}): BunPlugin {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const env = options.env;
  let absAppDir = isAbsolute(appDir) ? appDir : resolve(appDir);
  try {
    // Bun.build hands onLoad realpaths — a symlinked appDir (or macOS's
    // /var → /private/var) would silently miss the prefix check without this.
    absAppDir = realpathSync(absAppDir);
  } catch {
    // Nonexistent dir: keep the resolved path; onLoad simply never matches.
  }
  const routesDir = resolve(absAppDir, "routes") + sep;
  const rootTsx = resolve(absAppDir, "root.tsx");
  const rootTs = resolve(absAppDir, "root.ts");

  const transpilerFor = (loader: "ts" | "tsx") =>
    new Bun.Transpiler({
      loader,
      exports: { eliminate: [...SERVER_ONLY_ROUTE_EXPORTS] },
      trimUnusedImports: true,
      autoImportJSX: true,
      tsconfig: JSON.stringify({ compilerOptions: { jsx: "react-jsx", jsxImportSource: "react" } }),
    });
  // Plain `.ts` route/layout files must not be parsed as TSX (`<T>x` casts).
  const tsx = transpilerFor("tsx");
  const ts = transpilerFor("ts");

  return {
    name: "bract:route-shake",
    setup(build) {
      build.onLoad({ filter: /\.(tsx|ts)$/ }, async (args) => {
        const path = args.path;
        if (path !== rootTsx && path !== rootTs && !path.startsWith(routesDir)) return;
        const src = await Bun.file(path).text();
        if (hasServerDirective(src)) return;
        let contents = shakeRouteModuleSource(src, path.endsWith(".ts") ? ts : tsx, production);
        if (env) contents = rewriteClientEnv(contents, env.allowedKeys, env.values);
        return { contents, loader: "js" };
      });
    },
  };
}

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
export function shakeRouteModuleSource(
  src: string,
  transpiler: Bun.Transpiler,
  production: boolean = process.env.NODE_ENV === "production",
): string {
  let code = transpiler.transformSync(src);
  if (production) {
    code = code.replaceAll('"react/jsx-dev-runtime"', '"react/jsx-runtime"').replaceAll("jsxDEV as ", "jsx as ");
  }
  return code;
}
