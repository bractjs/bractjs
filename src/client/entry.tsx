import { hydrateRoot } from "react-dom/client";
import { type ReactElement, type ComponentType } from "react";
import { ClientRouter } from "./ClientRouter.tsx";
import { Outlet } from "./components/Outlet.tsx";
import { matchPatternForPath } from "./nav-utils.ts";
import type { BractJSClientData } from "./types.ts";
import type { RouteModuleClient } from "./router.tsx";

// ── Fallback App shell (used when rootChunk is missing) ────────────────────

function FallbackApp(): ReactElement {
  return <Outlet />;
}

// ── Hydration ──────────────────────────────────────────────────────────────

// Wrapped in async IIFE so we can await module imports before hydrateRoot().
// This prevents the SSR/client tree mismatch (server renders full root + route
// component, client must start with the same tree shape).
(async () => {
  const data: BractJSClientData = window.__BRACTJS_DATA__;

  // 1. Import the root component (app/root.tsx) so the client tree matches
  //    the server-rendered shell (html, head, body, header, nav, etc.).
  let RootComponent: ComponentType = FallbackApp;
  if (data.manifest.rootChunk) {
    const rootMod = await import(data.manifest.rootChunk);
    if (rootMod.default) RootComponent = rootMod.default;
  }

  // The SPA shell is built once for "/" and served for every document path —
  // the browser URL, not the payload, says where we actually are.
  const initialPathname = data.ssrMode === "spa" ? window.location.pathname : data.pathname;

  // 2. Pre-load the current route module so <Outlet> sees it during hydration.
  let initialModule: RouteModuleClient | null = null;
  const pattern = matchPatternForPath(initialPathname, data.manifest);
  const chunkUrl = pattern !== null ? data.manifest.routes[pattern]?.chunk : undefined;

  if (chunkUrl) {
    initialModule = (await import(chunkUrl)) as RouteModuleClient;
  } else if (data.routeFile) {
    const url = `/_hmr/module?file=${encodeURIComponent(data.routeFile)}&t=0`;
    initialModule = (await import(url)) as RouteModuleClient;
  }

  // Initial location: pathname comes from the server payload; search is
  // identical to the request's by construction. The hash never reaches the
  // server, so it is only known here.
  const initialLocation = {
    pathname: initialPathname,
    search: window.location.search,
    hash: window.location.hash,
    state: null,
    key: "default",
  };

  hydrateRoot(
    document,
    <ClientRouter
      initialData={{ ...data, location: initialLocation, search: data.search ?? {} }}
      initialModule={initialModule}
    >
      <RootComponent />
    </ClientRouter>,
  );
})();
