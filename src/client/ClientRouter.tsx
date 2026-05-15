import {
  useState, useCallback, useEffect, startTransition,
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
import { matchPatternForPath } from "./nav-utils.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BractJSInitialData extends RouteState {
  manifest: ServerManifest;
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

  const manifest = initialData.manifest;

  const setRoute = useCallback((state: Partial<RouteState>) => {
    if (state.loaderData !== undefined) setLoaderData(state.loaderData);
    if (state.actionData !== undefined) setActionData(state.actionData);
    if (state.params !== undefined) setParams(state.params);
    if (state.pathname !== undefined) setPathname(state.pathname);
  }, []);

  /** Load route data + module without touching history. */
  const loadRoute = useCallback(async (to: string) => {
    setNavState("loading");
    try {
      const pattern = matchPatternForPath(to, manifest);
      const chunkUrl = pattern !== null ? manifest.routes[pattern]?.chunk : undefined;
      const [routeModule, res] = await Promise.all([
        chunkUrl ? import(/* @vite-ignore */ chunkUrl) : Promise.resolve(null),
        fetch(`/_data?path=${encodeURIComponent(to)}`),
      ]);
      // Guard: always parse JSON, but only when the server signals success.
      // Without r.ok check, a Bun 500 plain-text response causes
      // SyntaxError: JSON.parse: unexpected character — an unhandled rejection.
      if (!res.ok) {
        console.error(`[bractjs] /_data ${res.status} for ${to}`);
        setNavState("idle");
        return;
      }
      const data = await res.json() as Record<string, unknown>;
      startTransition(() => {
        setLoaderData(data);
        setParams((data.params as Record<string, string>) ?? {});
        setPathname(to);
        setCurrentModule(routeModule);
      });
      const metaList = data.meta as Array<Record<string, unknown>> | undefined;
      const titleEntry = metaList?.find((m) => "title" in m);
      if (titleEntry && typeof titleEntry.title === "string") {
        document.title = titleEntry.title;
      }
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

  // Handle browser back / forward
  useEffect(() => {
    const onPopState = () => { void loadRoute(location.pathname); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadRoute]);

  // Module-level HMR: swap the current route module without a full reload.
  // The injected HMR client script calls window.__BRACTJS_HMR_ACCEPT__(pattern, mod)
  // after importing the freshly-built chunk from /_hmr/module.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __BRACTJS_HMR_ACCEPT__?: unknown };
    w.__BRACTJS_HMR_ACCEPT__ = (pattern: string, mod: RouteModuleClient) => {
      const current = matchPatternForPath(pathname, manifest);
      if (current === pattern) startTransition(() => setCurrentModule(mod));
    };
    return () => { delete w.__BRACTJS_HMR_ACCEPT__; };
  }, [pathname, manifest]);

  // Stub — real implementation in Prompt 2.6
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
        {children}
      </NavigationContext.Provider>
    </RouterContext.Provider>
  );
}
