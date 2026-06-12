import { createElement, type ComponentType } from "react";
import { join, resolve } from "node:path";
import { renderRoute, type ServerManifest } from "./render.ts";
import { BractJSProvider, type RouteManifest } from "../shared/context.ts";
import type { ModuleRegistry } from "./layout.ts";

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
  if (registry) {
    const rootMod = (registry["root.tsx"] ?? registry["root.ts"]) as { default?: ComponentType } | undefined;
    if (rootMod?.default) RootComponent = rootMod.default;
  } else {
    const rootPath = resolve(join(appDir, "root.tsx"));
    if (await Bun.file(rootPath).exists()) {
      const mod = (await import(rootPath)) as { default?: ComponentType };
      if (mod.default) RootComponent = mod.default;
    }
  }

  const loaderData = { root: null, layouts: [], route: null };
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
    children: createElement(RootComponent),
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
