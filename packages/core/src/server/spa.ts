import { join, resolve } from "node:path";
import { type ComponentType, createElement, type ReactNode } from "react";
import { BractJSProvider, type RouteManifest } from "../shared/context.ts";
import { devBustedSpecifier } from "./env.ts";
import type { ModuleRegistry } from "./layout.ts";
import { renderRoute, type ServerManifest } from "./render.ts";
import { fileExists } from "./runtime.ts";

/**
 * Render the SPA-mode document shell: the app's root component around an
 * empty outlet, with `ssrMode: "spa"` in the bootstrap payload. Served for
 * every document GET when the config sets `ssr: false`; the client router
 * resolves the actual route (module + /_data) after hydration.
 *
 * The root renders with NO loader data (its loader does not run for the
 * shell) and a "/" location — roots that render loader- or location-dependent
 * markup are not compatible with SPA mode. Loaders/actions stay fully
 * functional at runtime: SPA mode means "no document SSR", not "no server".
 */
export async function renderSpaShell(
  appDir: string,
  manifest: ServerManifest,
  registry?: ModuleRegistry,
): Promise<string> {
  let RootComponent: ComponentType = () => null;
  let RootLayout: ComponentType<{ children?: ReactNode }> | undefined;
  type RootExports = { default?: ComponentType; Layout?: ComponentType<{ children?: ReactNode }> };
  if (registry) {
    const rootMod = (registry["root.tsx"] ?? registry["root.ts"]) as RootExports | undefined;
    if (rootMod?.default) RootComponent = rootMod.default;
    RootLayout = rootMod?.Layout;
  } else {
    const rootPath = resolve(join(appDir, "root.tsx"));
    if (await fileExists(rootPath)) {
      // Dev: cache-busted so an edited root shell is live without a restart.
      const spec = devBustedSpecifier(rootPath);
      const mod = (await import(spec)) as RootExports;
      if (mod.default) RootComponent = mod.default;
      RootLayout = mod.Layout;
    }
  }

  const loaderData = { root: null, layouts: [], route: null };
  // eslint-disable-next-line react/no-children-prop -- children passed via createElement props object is the intended SSR shell shape
  const shell = createElement(BractJSProvider, {
    value: {
      loaderData: loaderData as unknown as Record<string, unknown>,
      actionData: null,
      params: {},
      pathname: "/",
      manifest: manifest as unknown as RouteManifest,
      RouteComponent: undefined,
      location: { pathname: "/", search: "", hash: "", state: null, key: "default" },
      search: {},
    },
    children: RootLayout
      ? createElement(RootLayout, null, createElement(RootComponent))
      : createElement(RootComponent),
  });

  const res = await renderRoute({
    shell,
    loaderData: loaderData as unknown as Record<string, unknown>,
    actionData: null,
    params: {},
    pathname: "/",
    search: {},
    manifest,
    meta: [],
    ssrMode: "spa",
  });
  return await res.text();
}
