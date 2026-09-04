import {
  type ReactElement,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ServerManifest } from "../server/render.ts";
import { MetaTags } from "../shared/meta-tags.tsx";
import {
  baseCssHrefs,
  CSS_PRECEDENCE_BASE,
  CSS_PRECEDENCE_ROUTE,
  routeCssHrefs,
  StyleLinks,
} from "../shared/style-links.tsx";
import type { MetaDescriptor, RouteMatch, RouterLocation } from "../shared/route-types.ts";
import { cacheKey, loaderCache } from "./cache.ts";
import { moduleView, parseDataPayload } from "./data-payload.ts";
import { createLocationKey, matchPatternForPath, parseTo, toSamePath } from "./nav-utils.ts";
import { type RevalidationInfo, registerRevalidator } from "./revalidation.ts";
import {
  type HydrationPending,
  type NavigateOptions,
  NavigationContext,
  type NavigationState,
  type RouteModuleClient,
  RouterContext,
  type RouteState,
} from "./router.tsx";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BractJSInitialData extends RouteState {
  manifest: ServerManifest;
  meta?: MetaDescriptor[];
  /** Present when the document did not SSR the route component (selective SSR / SPA shell). */
  ssrMode?: "client-only" | "data-only" | "spa";
}

interface ClientRouterProps {
  children: ReactNode;
  initialData: BractJSInitialData;
  initialModule?: RouteModuleClient | null;
}

/** History-entry init carried into loadRoute by navigate/popstate. */
interface LocationInit {
  key?: string;
  state?: unknown;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClientRouter({
  children,
  initialData,
  initialModule = null,
}: ClientRouterProps): ReactElement {
  const [loaderData, setLoaderData] = useState(initialData.loaderData);
  const [actionData, setActionData] = useState<unknown>(initialData.actionData);
  const [params, setParams] = useState(initialData.params);
  const [location, setLocation] = useState<RouterLocation>(initialData.location);
  const [search, setSearch] = useState<Record<string, unknown>>(initialData.search ?? {});
  const [matches, setMatches] = useState<RouteMatch[]>(initialData.matches ?? []);
  const [navState, setNavState] = useState<NavigationState>("idle");
  const [revalidationState, setRevalidationState] = useState<"idle" | "loading">("idle");
  const [currentModule, setCurrentModule] = useState<RouteModuleClient | null>(initialModule);
  const [meta, setMeta] = useState<MetaDescriptor[]>(initialData.meta ?? []);
  const [hydrationPending, setHydrationPending] = useState<HydrationPending>(initialData.ssrMode ?? false);

  const manifest = initialData.manifest;

  // Stable ref to navigate so loadRoute can call it without a circular dep.
  const navigateRef = useRef<(to: string) => Promise<void>>(null!);

  // Refs mirroring state that the stable revalidate/submit callbacks need.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  const currentModuleRef = useRef(currentModule);
  useEffect(() => {
    currentModuleRef.current = currentModule;
  }, [currentModule]);

  /**
   * Commit a `/_data` payload into router state. The five fields must always
   * move together — a payload applied without (say) its `matches` leaves
   * useMatches() rendering the previous route's chain. Callers wrap this in
   * startTransition alongside any commit-specific extras (location, module,
   * hydration flag).
   */
  const applyPayload = useCallback((data: Record<string, unknown>) => {
    const payload = parseDataPayload(data);
    setLoaderData(data);
    setParams(payload.params);
    setSearch(payload.search);
    // Re-render the document head from the new route's merged meta. React 19
    // hoists the <title>/<meta> elements rendered by <MetaTags> into <head>,
    // so description/OG tags update on soft navigation.
    setMeta(payload.meta);
    setMatches(payload.matches);
  }, []);

  const setRoute = useCallback((state: Partial<RouteState>) => {
    if (state.loaderData !== undefined) setLoaderData(state.loaderData);
    if (state.actionData !== undefined) setActionData(state.actionData);
    if (state.params !== undefined) setParams(state.params);
    if (state.search !== undefined) setSearch(state.search);
    if (state.matches !== undefined) setMatches(state.matches);
    if (state.location !== undefined) setLocation(state.location);
    else if (state.pathname !== undefined) {
      // Legacy callers pass a (possibly query-carrying) pathname string.
      const parsed = parseTo(state.pathname);
      setLocation((prev) => ({ ...prev, ...parsed }));
    }
  }, []);

  /** Load route data + module without touching history. */
  const loadRoute = useCallback(
    async (to: string, locInit?: LocationInit) => {
      setNavState("loading");
      // Follow a redirect Location from client-side beforeLoad. Same-origin
      // targets stay in the SPA; an off-origin/protocol-relative Location is NOT
      // fed to the router — we do a full-page navigation so the browser's own
      // cross-origin handling applies and we never open-redirect via pushState.
      const followRedirect = (loc: string) => {
        const safe = toSamePath(loc);
        if (safe) {
          void navigateRef.current(safe);
          return;
        }
        window.location.href = loc;
      };
      try {
        const { pathname: toPathname, search: toSearch, hash: toHash } = parseTo(to);
        // The path handed to /_data: never includes the hash (the fragment is
        // client-only) and never inherits the previous page's query string —
        // what you navigate to is exactly what loads.
        const dataPath = toPathname + toSearch;
        const nextLocation: RouterLocation = {
          pathname: toPathname,
          search: toSearch,
          hash: toHash,
          state: locInit?.state ?? null,
          key: locInit?.key ?? createLocationKey(),
        };
        const pattern = matchPatternForPath(toPathname, manifest);
        const chunkUrl = pattern !== null ? manifest.routes[pattern]?.chunk : undefined;

        // Load the route module first so we can run client-side beforeLoad.
        const routeModule = chunkUrl
          ? ((await import(/* @vite-ignore */ chunkUrl)) as RouteModuleClient)
          : null;
        const view = moduleView(routeModule);

        // Run client-side beforeLoad if exported from the route module.
        if (view && typeof view.beforeLoad === "function") {
          const url = new URL(to, window.location.href);
          try {
            const result = await view.beforeLoad({
              params: {},
              context: {},
              location: { pathname: url.pathname, search: url.search },
            });
            if (result instanceof Response) {
              const loc = result.headers.get("Location");
              if (loc) {
                followRedirect(loc);
                return;
              }
            }
          } catch (err) {
            if (err instanceof Response) {
              const loc = (err as Response).headers.get("Location");
              if (loc) {
                followRedirect(loc);
                return;
              }
            }
            throw err;
          }
        }

        // Commit a /_data payload + the new location in one transition.
        const commit = (data: Record<string, unknown>, module: RouteModuleClient | null) => {
          startTransition(() => {
            applyPayload(data);
            setLocation(nextLocation);
            setCurrentModule(module);
          });
        };

        // ── Cache lookup (B1 / B2) ──────────────────────────────────────────
        // Read config and loaderDeps from the route module if available.
        const staleTime = view?.config?.staleTime ?? 0;
        const gcTime = view?.config?.gcTime ?? 300_000;

        const searchParams = new URLSearchParams(toSearch);
        const deps = view?.loaderDeps ? view.loaderDeps({ searchParams }) : [dataPath];
        const key = cacheKey(toPathname, deps);

        const cached = loaderCache.get(key);
        if (cached?.fresh) {
          // Serve from cache immediately; skip fetch.
          commit(cached.data, routeModule);
          setNavState("idle");
          return;
        }
        if (cached && !cached.fresh) {
          // Stale-while-revalidate: render stale data immediately, then refresh.
          commit(cached.data, routeModule);
          setNavState("idle");
          // The route can veto the background refetch via shouldRevalidate.
          const gate = view?.shouldRevalidate;
          const allowRefetch = gate
            ? gate({
                currentUrl: new URL(window.location.href),
                nextUrl: new URL(dataPath, window.location.origin),
                defaultShouldRevalidate: true,
              })
            : true;
          if (!allowRefetch) return;
          // Revalidate in background.
          void fetch(`/_data?path=${encodeURIComponent(dataPath)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((fresh) => {
              if (!fresh) return;
              const freshData = fresh as Record<string, unknown>;
              loaderCache.set(key, freshData, staleTime, gcTime);
              startTransition(() => applyPayload(freshData));
            });
          return;
        }

        // Cache miss — fetch from server.
        const res = await fetch(`/_data?path=${encodeURIComponent(dataPath)}`);
        // Guard: always parse JSON, but only when the server signals success.
        // Without res.ok check, a Bun 500 plain-text response causes
        // SyntaxError: JSON.parse: unexpected character — an unhandled rejection.
        if (!res.ok) {
          console.error(`[bractjs] /_data ${res.status} for ${to}`);
          setNavState("idle");
          return;
        }
        const data = (await res.json()) as Record<string, unknown>;

        // clientLoader (RR7-style): when the route exports one, it runs in the
        // browser and its result replaces the route's loader slice. It receives a
        // `serverLoader()` that resolves to the freshly-fetched server data, so a
        // clientLoader can wrap/augment/cache it. Other slices (root/layouts) and
        // the meta/matches payload are untouched.
        const clientLoader = view?.clientLoader;
        if (typeof clientLoader === "function") {
          try {
            data.route = await clientLoader({
              request: new Request(new URL(dataPath, window.location.origin)),
              params: (data.params as Record<string, string>) ?? {},
              search: (data.search as Record<string, unknown>) ?? {},
              serverLoader: () => Promise.resolve(data.route),
            });
          } catch (err) {
            console.error("[bractjs] clientLoader error:", err);
          }
        }

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
          void import(/* @vite-ignore */ "/_bractjs/devtools.js")
            .then(({ updateDevtoolsState }) => {
              updateDevtoolsState({
                route: toPathname,
                loaderData: data,
                navState: "idle",
                cacheEntries: loaderCache.entries(),
              });
            })
            .catch(() => {
              /* devtools not available in prod */
            });
        }
        commit(data, routeModule);
      } catch (err) {
        console.error("[bractjs] loadRoute error:", err);
      } finally {
        setNavState("idle");
      }
    },
    [manifest, applyPayload],
  );

  const navigate = useCallback(
    async (to: string, options?: NavigateOptions) => {
      const key = createLocationKey();
      await loadRoute(to, { key, state: options?.state ?? null });
      const entry = { __bractKey: key, __bractState: options?.state ?? null };
      if (options?.replace) history.replaceState(entry, "", to);
      else history.pushState(entry, "", to);
    },
    [loadRoute],
  );

  // Keep navigateRef current so loadRoute can redirect via navigate.
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  /**
   * Re-run the active route's loaders and commit fresh data without touching
   * history or the location. Gated by the route's shouldRevalidate export;
   * mutation-triggered runs (info.formMethod set) first drop the whole loader
   * cache — any cached entry may reflect pre-mutation state.
   */
  const revalidate = useCallback(
    async (info?: RevalidationInfo) => {
      const loc = locationRef.current;
      const path = loc.pathname + loc.search;
      const gate = moduleView(currentModuleRef.current)?.shouldRevalidate;
      const url = new URL(path, window.location.origin);
      const allow = gate
        ? gate({
            currentUrl: url,
            nextUrl: url,
            formMethod: info?.formMethod,
            actionStatus: info?.actionStatus,
            defaultShouldRevalidate: true,
          })
        : true;
      if (!allow) return;
      if (info?.formMethod) loaderCache.clear();
      setRevalidationState("loading");
      try {
        const res = await fetch(`/_data?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
          console.error(`[bractjs] revalidate /_data ${res.status} for ${path}`);
          return;
        }
        const data = (await res.json()) as Record<string, unknown>;
        startTransition(() => applyPayload(data));
      } catch (err) {
        console.error("[bractjs] revalidate error:", err);
      } finally {
        setRevalidationState("idle");
      }
    },
    [applyPayload],
  );

  // Let fetchers trigger revalidation without importing this component.
  useEffect(() => {
    registerRevalidator(revalidate);
    return () => registerRevalidator(null);
  }, [revalidate]);

  // clientLoader.hydrate: for a fully-SSR'd route whose clientLoader opted into
  // hydration, run it once after mount and replace the route's loader slice.
  // Routes that didn't SSR (hydrationPending truthy) take the fetch path below,
  // where clientLoader already applies via loadRoute on navigation; this effect
  // is only for the first paint of an SSR document.
  useEffect(() => {
    if (hydrationPending) return;
    const cl = moduleView(initialModule)?.clientLoader;
    if (typeof cl !== "function" || cl.hydrate !== true) return;
    let cancelled = false;
    void (async () => {
      const path = window.location.pathname + window.location.search;
      const serverSlice = (initialData.loaderData as Record<string, unknown>)?.route;
      try {
        const next = await cl({
          request: new Request(new URL(path, window.location.origin)),
          params: initialData.params,
          search: initialData.search ?? {},
          serverLoader: async () => serverSlice,
        });
        if (cancelled) return;
        startTransition(() => {
          setLoaderData((prev) => ({ ...prev, route: next }));
        });
      } catch (err) {
        console.error("[bractjs] clientLoader (hydrate) error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selective-SSR / SPA hydration completion. The first client render matched
  // the server (Fallback or empty shell); after mount, put loader data in
  // place and swap in the real component via a transition.
  useEffect(() => {
    if (!hydrationPending) return;
    if (hydrationPending === "data-only") {
      // Loaders already ran on the server — the data arrived in the bootstrap.
      startTransition(() => setHydrationPending(false));
      return;
    }
    // "client-only" / "spa": the route loader never ran for this document.
    void (async () => {
      const path = window.location.pathname + window.location.search;
      try {
        const res = await fetch(`/_data?path=${encodeURIComponent(path)}`);
        // A redirect here is a beforeLoad gate (SPA shells skip server-side
        // gating on the document). Do a real navigation — never render a
        // protected route around redirected data.
        if (res.redirected) {
          const safe = toSamePath(res.url);
          window.location.assign(safe ?? res.url);
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          startTransition(() => {
            applyPayload(data);
            setHydrationPending(false);
          });
          return;
        }
        console.error(`[bractjs] hydration /_data ${res.status} for ${path}`);
      } catch (err) {
        console.error("[bractjs] hydration fetch error:", err);
      }
      startTransition(() => setHydrationPending(false));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stamp the initial history entry with our key so back/forward to it can
  // restore scroll position. Merge into any pre-existing state, don't replace.
  useEffect(() => {
    const st = history.state as Record<string, unknown> | null;
    if (!st || typeof st.__bractKey !== "string") {
      history.replaceState({ ...(st ?? {}), __bractKey: initialData.location.key }, "", window.location.href);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle browser back / forward. `window.location` must stay explicit here —
  // the component has a `location` state variable that would shadow the global.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const st = e.state as { __bractKey?: string; __bractState?: unknown } | null;
      void loadRoute(window.location.pathname + window.location.search + window.location.hash, {
        key: st?.__bractKey ?? "default",
        state: st?.__bractState ?? null,
      });
    };
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
      const current = matchPatternForPath(location.pathname, manifest);
      if (current === pattern) startTransition(() => setCurrentModule(mod));
    };
    return () => {
      delete w.__BRACTJS_HMR_ACCEPT__;
    };
  }, [location.pathname, manifest]);

  /**
   * Submit a mutation: navState walks "submitting" → "loading" (revalidation)
   * → "idle", which is what `useNavigation()` renders pending UI from. The
   * fetch mirrors `<Form>`'s contract: the CSRF header marks it a same-origin
   * mutation, and a redirected response becomes a real navigation — via
   * toSamePath so an attacker-controlled Location can never soft-nav the SPA.
   */
  const submit = useCallback(
    async (to: string, opts: { method: string; body: FormData | Record<string, string> }) => {
      setNavState("submitting");
      try {
        const body = opts.body instanceof FormData ? opts.body : new URLSearchParams(opts.body);

        // The server submit — also the `serverAction()` a clientAction can call.
        // A redirected response short-circuits to a real navigation (via
        // toSamePath so an attacker Location can never soft-nav the SPA); it
        // returns a sentinel so the caller stops.
        const REDIRECTED = Symbol("redirected");
        let lastStatus = 0;
        const doServerPost = async (): Promise<unknown> => {
          const res = await fetch(to, {
            method: opts.method.toUpperCase(),
            body,
            headers: { "X-BractJS-Action": "1" },
          });
          lastStatus = res.status;
          // Preferred path: the server enveloped the action redirect
          // (204 + X-BractJS-Redirect) instead of a raw 3xx, so no throwaway
          // document GET ever happened — soft-nav straight to the target
          // (its /_data request is the first to present one-shot cookies).
          const envelope = res.headers.get("X-BractJS-Redirect");
          if (envelope !== null) {
            const safe = toSamePath(envelope);
            if (safe) {
              await navigateRef.current(safe);
              return REDIRECTED;
            }
            window.location.assign(envelope);
            return REDIRECTED;
          }
          if (res.redirected) {
            const safe = toSamePath(res.url);
            if (safe) {
              await navigateRef.current(safe);
              return REDIRECTED;
            }
            window.location.assign(res.url);
            return REDIRECTED;
          }
          return res.json();
        };

        // clientAction (RR7-style): if the target route exports one, it runs in
        // the browser and decides whether/how to hit the server via serverAction().
        const [toPath] = to.split("?");
        const pattern = matchPatternForPath(toPath, manifest);
        const chunkUrl = pattern !== null ? manifest.routes[pattern]?.chunk : undefined;
        let clientAction: import("../shared/route-types.ts").ClientActionFunction | undefined;
        if (chunkUrl) {
          try {
            const mod = moduleView(await import(/* @vite-ignore */ chunkUrl));
            if (typeof mod?.clientAction === "function") {
              clientAction = mod.clientAction;
            }
          } catch {
            /* fall back to a plain server submit */
          }
        }

        let data: unknown;
        if (clientAction) {
          let calledServer = false;
          data = await clientAction({
            request: new Request(new URL(to, window.location.origin), { method: opts.method.toUpperCase() }),
            params: paramsRef.current,
            formData: body instanceof FormData ? body : new FormData(),
            serverAction: () => {
              calledServer = true;
              return doServerPost();
            },
          });
          // If the clientAction triggered a redirect via serverAction(), stop.
          if (calledServer && data === REDIRECTED) return;
        } else {
          data = await doServerPost();
          if (data === REDIRECTED) return;
        }

        setActionData(data);
        setNavState("loading");
        await revalidate({ formMethod: opts.method, actionStatus: lastStatus });
      } finally {
        setNavState("idle");
      }
    },
    [revalidate, manifest],
  );

  return (
    <RouterContext.Provider
      value={{
        loaderData,
        actionData,
        params,
        pathname: location.pathname,
        location,
        search,
        matches,
        manifest,
        currentModule,
        setRoute,
        revalidate,
        revalidationState,
        hydrationPending,
      }}
    >
      <NavigationContext.Provider value={{ state: navState, navigate, submit }}>
        <MetaTags meta={meta} />
        {/*
          Mirrors the server tree so hydration matches, and keeps the document's
          stylesheets in sync across soft navigation. React dedupes by href, so
          re-rendering never duplicates a sheet; `precedence` also makes React
          wait for a newly-inserted stylesheet to load before committing, which
          is what stops a route swap from painting unstyled.
        */}
        <StyleLinks hrefs={baseCssHrefs(manifest)} precedence={CSS_PRECEDENCE_BASE} />
        <StyleLinks
          hrefs={routeCssHrefs(manifest, matchPatternForPath(location.pathname, manifest))}
          precedence={CSS_PRECEDENCE_ROUTE}
        />
        {children}
      </NavigationContext.Provider>
    </RouterContext.Provider>
  );
}
