import { type ComponentType, type ReactElement, type ReactNode, useContext } from "react";
import { hydrateRoot } from "react-dom/client";
import { ClientRouter, loadLayoutModules } from "./ClientRouter.tsx";
import { reviveDeferred } from "./deferred-revive.ts";
import { Outlet } from "./components/Outlet.tsx";
import { matchPatternForPath, setClientI18n } from "./nav-utils.ts";
import { type RouteModuleClient, RouterContext } from "./router.tsx";
import type { BractJSClientData } from "./types.ts";
import { RootErrorDocument } from "../shared/root-error-document.tsx";
import { pickErrorBoundary, routeLoaderError } from "../shared/route-error.ts";

// ── Fallback App shell (used when rootChunk is missing) ────────────────────

function FallbackApp(): ReactElement {
  return <Outlet />;
}

/** Renders root.tsx with React Router-style props (root's loader slice), like the server does. */
function RootWithProps({ Root }: { Root: ComponentType<Record<string, unknown>> }): ReactElement {
  const r = useContext(RouterContext);
  return (
    <Root
      loaderData={r.loaderData.root}
      actionData={r.actionData ?? undefined}
      params={r.params}
      matches={r.matches}
    />
  );
}

// ── Hydration ──────────────────────────────────────────────────────────────

// Wrapped in async IIFE so we can await module imports before hydrateRoot().
// This prevents the SSR/client tree mismatch (server renders full root + route
// component, client must start with the same tree shape).
(async () => {
  const data: BractJSClientData = window.__BRACTJS_DATA__;

  // Dev-only: surface a loader error captured during SSR in the error overlay.
  // safeRun serializes failures as `{ __error: { message, stack, routeFile } }`
  // into each loader slot; this is the overlay's producer (the overlay script
  // installs a __BRACTJS_ERROR__ setter but nothing assigned it before).
  if ((window as unknown as { __BRACT_DEV__?: boolean }).__BRACT_DEV__) {
    const slots = [
      data.loaderData?.root,
      data.loaderData?.route,
      ...((data.loaderData?.layouts as unknown[]) ?? []),
    ];
    for (const slot of slots) {
      const e = (
        slot as { __error?: { message?: string; stack?: string; routeFile?: string; status?: number } } | null
      )?.__error;
      // A status means a deliberate HttpError (a 404 etc.): the page's
      // ErrorBoundary is the intended UI, not a bug to overlay.
      if (e && e.status === undefined) {
        const where = e.routeFile ? ` in ${e.routeFile}` : "";
        (window as unknown as { __BRACTJS_ERROR__?: unknown }).__BRACTJS_ERROR__ = {
          message: `Loader error${where}: ${e.message ?? "unknown error"}`,
          stack: e.stack,
        };
        break;
      }
    }
  }

  // i18n: the client matcher strips locale prefixes like the server does.
  setClientI18n(data.i18n);

  // 1. Import the root component (app/root.tsx) so the client tree matches
  //    the server-rendered shell (html, head, body, header, nav, etc.).
  let RootComponent: ComponentType = FallbackApp;
  let rootErrorBoundary: ComponentType<{ error: unknown }> | undefined;
  // root.tsx's `Layout` (the document shell), wrapping the root component.
  let RootLayout: ComponentType<{ children?: ReactNode }> | undefined;
  let rootModule: RouteModuleClient | null = null;
  if (data.manifest.rootChunk) {
    const rootMod = await import(data.manifest.rootChunk);
    rootModule = rootMod as RouteModuleClient;
    if (rootMod.default) RootComponent = rootMod.default;
    rootErrorBoundary = rootMod.ErrorBoundary;
    RootLayout = rootMod.Layout;
  }

  // A failed root loader: the server sent RootErrorDocument instead of the app.
  // Hydrate that same tree — no router (/_data would hit the same failed
  // loader), so links stay document loads that retry the app.
  if (data.rootError) {
    const error = routeLoaderError(data.loaderData.root) ?? new Error("Internal Server Error");
    hydrateRoot(
      document,
      <RootErrorDocument
        Boundary={pickErrorBoundary(rootErrorBoundary)}
        Layout={RootLayout}
        error={error}
        status={data.rootError.status}
        params={data.params}
        pathname={data.pathname}
        search={window.location.search}
        manifest={data.manifest}
        requestId={data.requestId}
        locale={data.locale}
        i18n={data.i18n}
      />,
    );
    return;
  }

  // The SPA shell is built once for "/" and served for every document path —
  // the browser URL, not the payload, says where we actually are.
  const initialPathname = data.ssrMode === "spa" ? window.location.pathname : data.pathname;

  // 2. Pre-load the current route module so <Outlet> sees it during hydration.
  let initialModule: RouteModuleClient | null = null;
  const pattern = matchPatternForPath(initialPathname, data.manifest);
  const chunkUrl = pattern !== null ? data.manifest.routes[pattern]?.chunk : undefined;

  // …and its layout.tsx modules, so the client tree matches the server's.
  const layoutsLoaded = loadLayoutModules(
    pattern !== null ? data.manifest.routes[pattern]?.layouts : undefined,
  );
  if (chunkUrl) {
    initialModule = (await import(chunkUrl)) as RouteModuleClient;
  } else if (data.routeFile) {
    const url = `/_hmr/module?file=${encodeURIComponent(data.routeFile)}&t=0`;
    initialModule = (await import(url)) as RouteModuleClient;
  }
  const initialLayouts = await layoutsLoaded;

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

  // defer() fields arrive as markers; their values follow at the end of the
  // document (possibly after hydration starts — <Await> suspends until then).
  const { matches, ...loaderData } = reviveDeferred({ ...data.loaderData, matches: data.matches ?? [] });

  hydrateRoot(
    document,
    <ClientRouter
      initialData={{
        ...data,
        loaderData,
        location: initialLocation,
        search: data.search ?? {},
        matches,
      }}
      initialModule={initialModule}
      initialLayouts={initialLayouts}
      rootErrorBoundary={rootErrorBoundary}
      rootModule={rootModule}
    >
      {RootLayout ? (
        <RootLayout>
          <RootWithProps Root={RootComponent as ComponentType<Record<string, unknown>>} />
        </RootLayout>
      ) : (
        <RootWithProps Root={RootComponent as ComponentType<Record<string, unknown>>} />
      )}
    </ClientRouter>,
  );
})();
