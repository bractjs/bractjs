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

  // 2. Pre-load the current route module so <Outlet> sees it during hydration.
  let initialModule: RouteModuleClient | null = null;
  const pattern = matchPatternForPath(data.pathname, data.manifest);
  const chunkUrl = pattern !== null ? data.manifest.routes[pattern]?.chunk : undefined;

  if (chunkUrl) {
    initialModule = (await import(chunkUrl)) as RouteModuleClient;
  } else if (data.routeFile) {
    const url = `/_hmr/module?file=${encodeURIComponent(data.routeFile)}&t=0`;
    initialModule = (await import(url)) as RouteModuleClient;
  }

  hydrateRoot(
    document,
    <ClientRouter initialData={data} initialModule={initialModule}>
      <RootComponent />
    </ClientRouter>,
  );
})();
