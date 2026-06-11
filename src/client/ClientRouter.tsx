import {
  useState, useCallback, useEffect, useRef, startTransition,
  type ReactNode, type ReactElement,
} from "react";
import {
  RouterContext,
  NavigationContext,
  type RouteState,
  type NavigationState,
  type RouteModuleClient,
} from "./router.tsx";
import type { ServerManifest } from "../server/render.ts";
import { matchPatternForPath, toSamePath } from "./nav-utils.ts";
import { loaderCache, cacheKey } from "./cache.ts";
import { MetaTags } from "../shared/meta-tags.tsx";
import type { MetaDescriptor } from "../shared/route-types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BractJSInitialData extends RouteState {
  manifest: ServerManifest;
  meta?: MetaDescriptor[];
}

interface ClientRouterProps {
  children: ReactNode;
  initialData: BractJSInitialData;
  initialModule?: RouteModuleClient | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClientRouter({ children, initialData, initialModule = null }: ClientRouterProps): ReactElement {
  const [loaderData, setLoaderData] = useState(initialData.loaderData);
  const [actionData, setActionData] = useState<unknown>(initialData.actionData);
  const [params, setParams] = useState(initialData.params);
  const [pathname, setPathname] = useState(initialData.pathname);
  const [navState, setNavState] = useState<NavigationState>("idle");
  const [currentModule, setCurrentModule] = useState<RouteModuleClient | null>(initialModule);
  const [meta, setMeta] = useState<MetaDescriptor[]>(initialData.meta ?? []);

  const manifest = initialData.manifest;

  // Stable ref to navigate so loadRoute can call it without a circular dep.
  const navigateRef = useRef<(to: string) => Promise<void>>(null!);

  const setRoute = useCallback((state: Partial<RouteState>) => {
    if (state.loaderData !== undefined) setLoaderData(state.loaderData);
    if (state.actionData !== undefined) setActionData(state.actionData);
    if (state.params !== undefined) setParams(state.params);
    if (state.pathname !== undefined) setPathname(state.pathname);
  }, []);

  /** Load route data + module without touching history. */
  const loadRoute = useCallback(async (to: string) => {
    setNavState("loading");
    // Follow a redirect Location from client-side beforeLoad. Same-origin
    // targets stay in the SPA; an off-origin/protocol-relative Location is NOT
    // fed to the router — we do a full-page navigation so the browser's own
    // cross-origin handling applies and we never open-redirect via pushState.
    const followRedirect = (loc: string) => {
      const safe = toSamePath(loc);
      if (safe) { void navigateRef.current(safe); return; }
      window.location.href = loc;
    };
    try {
      const toPathname = to.split("?")[0];
      const pattern = matchPatternForPath(toPathname, manifest);
      const chunkUrl = pattern !== null ? manifest.routes[pattern]?.chunk : undefined;

      // Load the route module first so we can run client-side beforeLoad.
      const routeModule = chunkUrl
        ? (await import(/* @vite-ignore */ chunkUrl) as RouteModuleClient & { beforeLoad?: unknown })
        : null;

      // Run client-side beforeLoad if exported from the route module.
      if (routeModule && typeof routeModule.beforeLoad === "function") {
        const url = new URL(to, window.location.href);
        try {
          const result = await (routeModule.beforeLoad as (args: {
            params: Record<string, string>;
            context: Record<string, unknown>;
            location: { pathname: string; search: string };
          }) => Promise<Response | void>)({
            params: {},
            context: {},
            location: { pathname: url.pathname, search: url.search },
          });
          if (result instanceof Response) {
            const loc = result.headers.get("Location");
            if (loc) { followRedirect(loc); return; }
          }
        } catch (err) {
          if (err instanceof Response) {
            const loc = (err as Response).headers.get("Location");
            if (loc) { followRedirect(loc); return; }
          }
          throw err;
        }
      }

      // Include search params in the /_data path param so loaders receive them.
      const toWithSearch = to.includes("?") ? to : to + window.location.search;

      // ── Cache lookup (B1 / B2) ──────────────────────────────────────────
      // Read config and loaderDeps from the route module if available.
      const routeConfig = (routeModule as Record<string, unknown> | null)?.config as
        | { staleTime?: number; gcTime?: number }
        | undefined;
      const staleTime = routeConfig?.staleTime ?? 0;
      const gcTime = routeConfig?.gcTime ?? 300_000;

      const loaderDepsFn = (routeModule as Record<string, unknown> | null)?.loaderDeps as
        | ((args: { searchParams: URLSearchParams }) => unknown[])
        | undefined;
      const searchParams = new URLSearchParams(toWithSearch.split("?")[1] ?? "");
      const deps = loaderDepsFn ? loaderDepsFn({ searchParams }) : [toWithSearch];
      const key = cacheKey(toPathname, deps);

      const cached = loaderCache.get(key);
      if (cached?.fresh) {
        // Serve from cache immediately; skip fetch.
        startTransition(() => {
          setLoaderData(cached.data);
          setParams((cached.data.params as Record<string, string>) ?? {});
          setPathname(to);
          setCurrentModule(routeModule);
        });
        setNavState("idle");
        return;
      }
      if (cached && !cached.fresh) {
        // Stale-while-revalidate: render stale data immediately, then refresh.
        startTransition(() => {
          setLoaderData(cached.data);
          setParams((cached.data.params as Record<string, string>) ?? {});
          setPathname(to);
          setCurrentModule(routeModule);
        });
        setNavState("idle");
        // Revalidate in background.
        void fetch(`/_data?path=${encodeURIComponent(toWithSearch)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((fresh) => {
            if (!fresh) return;
            loaderCache.set(key, fresh as Record<string, unknown>, staleTime, gcTime);
            startTransition(() => {
              setLoaderData(fresh as Record<string, unknown>);
              setParams(((fresh as Record<string, unknown>).params as Record<string, string>) ?? {});
            });
          });
        return;
      }

      // Cache miss — fetch from server.
      const res = await fetch(`/_data?path=${encodeURIComponent(toWithSearch)}`);
      // Guard: always parse JSON, but only when the server signals success.
      // Without res.ok check, a Bun 500 plain-text response causes
      // SyntaxError: JSON.parse: unexpected character — an unhandled rejection.
      if (!res.ok) {
        console.error(`[bractjs] /_data ${res.status} for ${to}`);
        setNavState("idle");
        return;
      }
      const data = await res.json() as Record<string, unknown>;
      if (staleTime > 0) loaderCache.set(key, data, staleTime, gcTime);

      // Update DevTools state (dev-only — no-op in prod since the import fails).
      const w = window as unknown as { __BRACT_DEV__?: boolean };
      if (w.__BRACT_DEV__ === true) {
        // Use the dev-only HTTP endpoint (registered in serve.ts) rather than
        // a relative source-path import — Bun preserves dynamic-import paths
        // as runtime URLs, and a relative .ts path 404s in the browser. TS
        // can't resolve the absolute URL spec, but `.catch()` below swallows
        // the import failure in prod where the endpoint isn't registered.
        // @ts-expect-error TS2307 — runtime URL served by serve.ts in dev only
        void import(/* @vite-ignore */ "/_bractjs/devtools.js").then(({ updateDevtoolsState }) => {
          updateDevtoolsState({
            route: toPathname,
            loaderData: data,
            navState: "idle",
            cacheEntries: loaderCache.entries(),
          });
        }).catch(() => {/* devtools not available in prod */});
      }
      startTransition(() => {
        setLoaderData(data);
        setParams((data.params as Record<string, string>) ?? {});
        setPathname(to);
        setCurrentModule(routeModule);
      });
      // Re-render the document head from the new route's merged meta. React 19
      // hoists the <title>/<meta> elements rendered by <MetaTags> into <head>,
      // so description/OG tags update on soft navigation, not just the title.
      const nextMeta = (data.meta as MetaDescriptor[] | undefined) ?? [];
      startTransition(() => setMeta(nextMeta));
    } catch (err) {
      console.error("[bractjs] loadRoute error:", err);
    } finally {
      setNavState("idle");
    }
  }, [manifest]);

  const navigate = useCallback(async (to: string) => {
    await loadRoute(to);
    history.pushState({}, "", to);
  }, [loadRoute]);

  // Keep navigateRef current so loadRoute can redirect via navigate.
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  // Handle browser back / forward
  useEffect(() => {
    const onPopState = () => { void loadRoute(location.pathname + location.search); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadRoute]);

  // Module-level HMR: swap the current route module without a full reload.
  // The injected HMR client script calls window.__BRACTJS_HMR_ACCEPT__(pattern, mod)
  // after importing the freshly-built chunk from /_hmr/module.
  // Dev gate: prod builds inject __BRACT_DEV__ = false; absence in browser also
  // counts as prod since we never reference `process` here.
  useEffect(() => {
    const w = window as unknown as { __BRACT_DEV__?: boolean; __BRACTJS_HMR_ACCEPT__?: unknown };
    if (w.__BRACT_DEV__ !== true) return;
    w.__BRACTJS_HMR_ACCEPT__ = (pattern: string, mod: RouteModuleClient) => {
      const current = matchPatternForPath(pathname, manifest);
      if (current === pattern) startTransition(() => setCurrentModule(mod));
    };
    return () => { delete w.__BRACTJS_HMR_ACCEPT__; };
  }, [pathname, manifest]);

  const submit = useCallback(async (
    _to: string,
    _opts: { method: string; body: FormData | Record<string, string> },
  ) => {
    setNavState("submitting");
    setNavState("idle");
  }, []);

  return (
    <RouterContext.Provider value={{ loaderData, actionData, params, pathname, manifest, currentModule, setRoute }}>
      <NavigationContext.Provider value={{ state: navState, navigate, submit }}>
        <MetaTags meta={meta} />
        {children}
      </NavigationContext.Provider>
    </RouterContext.Provider>
  );
}
