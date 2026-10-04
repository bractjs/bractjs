import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  applyClientLoaders,
  type ClientChain,
  createClientContext,
  registerClientChainResolver,
  runClientMiddleware,
} from "./client-data.ts";
import { RequestIdContext } from "../shared/request-id.ts";
import type { ServerManifest } from "../server/render.ts";
import { LinkTags } from "../shared/link-tags.tsx";
import { MetaTags } from "../shared/meta-tags.tsx";
import {
  baseCssHrefs,
  CSS_PRECEDENCE_BASE,
  CSS_PRECEDENCE_ROUTE,
  routeCssHrefs,
  StyleLinks,
} from "../shared/style-links.tsx";
import type { LinkDescriptor, MetaDescriptor, RouteMatch, RouterLocation } from "../shared/route-types.ts";
import { type HistoryAction, findBlocker } from "./blocker-store.ts";
import { cacheKey, loaderCache } from "./cache.ts";
import { moduleView, parseDataPayload } from "./data-payload.ts";
import { reviveDeferred } from "./deferred-revive.ts";
import { assignExternal, createLocationKey, matchPatternForPath, parseTo, toSamePath } from "./nav-utils.ts";
import { type RevalidationInfo, registerNavigator, registerRevalidator } from "./revalidation.ts";
import { commitWithTransition } from "./view-transition.ts";
import {
  type HydrationPending,
  type NavigateOptions,
  NavigationContext,
  type NavigationDetail,
  type NavigationState,
  type RouteModuleClient,
  RouterContext,
  type RouterSubmitOptions,
  type RouteState,
} from "./router.tsx";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BractJSInitialData extends RouteState {
  manifest: ServerManifest;
  meta?: MetaDescriptor[];
  /** Route `links()` descriptors from the server. */
  links?: LinkDescriptor[];
  /** Present when the document did not SSR the route component (selective SSR / SPA shell). */
  ssrMode?: "client-only" | "data-only" | "spa";
  /** The request id from the requestId() middleware, when registered. */
  requestId?: string;
  /** The page's locale and the app's i18n config (with `i18n` configured). */
  locale?: string;
  i18n?: import("../shared/i18n.ts").I18nConfig;
}

interface ClientRouterProps {
  children: ReactNode;
  initialData: BractJSInitialData;
  initialModule?: RouteModuleClient | null;
  /** The initial route's layout.tsx modules, outermost first. */
  initialLayouts?: Array<RouteModuleClient | null>;
  /** root.tsx's ErrorBoundary export, if any. */
  rootErrorBoundary?: ComponentType<{ error: unknown }>;
  /** root.tsx's client module (its clientLoader / clientMiddleware run on every navigation). */
  rootModule?: RouteModuleClient | null;
}

/** History-entry init carried into loadRoute by navigate/popstate. */
interface LocationInit {
  key?: string;
  state?: unknown;
  /** From `<Link defaultShouldRevalidate>` / `navigate(to, { defaultShouldRevalidate })`. */
  defaultShouldRevalidate?: boolean;
  /** Commit inside a View Transition (`viewTransition` on Link / navigate / Form). */
  viewTransition?: boolean;
}

/** `to` as a location object, for blocker checks and `useNavigation().location`. */
function toLocation(to: string, init?: LocationInit): RouterLocation {
  const { pathname, search, hash } = parseTo(to);
  return { pathname, search, hash, state: init?.state ?? null, key: init?.key ?? createLocationKey() };
}

/** Import a route's layout.tsx chunks (outermost first); a chunk that fails to load renders nothing. */
export async function loadLayoutModules(
  urls: string[] | undefined,
): Promise<Array<RouteModuleClient | null>> {
  return Promise.all(
    (urls ?? []).map((url) =>
      (import(/* @vite-ignore */ url) as Promise<RouteModuleClient>).catch((err: unknown) => {
        console.error(`[bractjs] failed to load layout ${url}:`, err);
        return null;
      }),
    ),
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClientRouter({
  children,
  initialData,
  initialModule = null,
  initialLayouts = [],
  rootErrorBoundary,
  rootModule = null,
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
  const [currentLayouts, setCurrentLayouts] = useState<Array<RouteModuleClient | null>>(initialLayouts);
  const [meta, setMeta] = useState<MetaDescriptor[]>(initialData.meta ?? []);
  const [links, setLinks] = useState<LinkDescriptor[]>(initialData.links ?? []);
  // The id of the request whose data is on screen (requestId() middleware).
  const [requestId, setRequestId] = useState<string | undefined>(initialData.requestId);
  // The locale of the page on screen (i18n): each /_data payload carries it.
  const [locale, setLocale] = useState<string | undefined>(initialData.locale);
  const [navDetail, setNavDetail] = useState<NavigationDetail>({});
  const [navigationType, setNavigationType] = useState<HistoryAction>("POP");
  const [hydrationPending, setHydrationPending] = useState<HydrationPending>(initialData.ssrMode ?? false);

  const manifest = initialData.manifest;

  // Stable ref to navigate so loadRoute can call it without a circular dep.
  const navigateRef = useRef<(to: string, options?: NavigateOptions) => Promise<void>>(null!);

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
  const currentLayoutsRef = useRef(currentLayouts);
  useEffect(() => {
    currentLayoutsRef.current = currentLayouts;
  }, [currentLayouts]);
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
    setLinks(payload.links);
    setMatches(payload.matches);
    setRequestId(typeof data.requestId === "string" ? data.requestId : undefined);
    if (typeof data.locale === "string") setLocale(data.locale);
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

  /**
   * Load route data + module without touching history. Resolves `false` when
   * it handed the navigation to the browser instead (a document load), so the
   * caller must not push a history entry for it.
   */
  const loadRoute = useCallback(
    async (to: string, locInit?: LocationInit): Promise<false | void> => {
      setNavState("loading");
      setNavDetail((prev) => ({ ...prev, location: toLocation(to, locInit) }));
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
        assignExternal(loc);
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

        // Load the route module first so we can run client-side beforeLoad —
        // and its layout.tsx modules alongside, so the new tree renders whole.
        const [routeModule, layoutModules] = await Promise.all([
          chunkUrl ? (import(/* @vite-ignore */ chunkUrl) as Promise<RouteModuleClient>) : null,
          loadLayoutModules(pattern !== null ? manifest.routes[pattern]?.layouts : undefined),
        ]);
        const view = moduleView(routeModule);
        // One context per navigation: clientMiddleware, beforeLoad and the
        // client loaders share it (context.set in middleware → .get in loaders).
        const chain: ClientChain = { root: rootModule, layouts: layoutModules, route: routeModule };
        const clientContext = createClientContext();
        const dataRequest = new Request(new URL(dataPath, window.location.origin));

        // Run client-side beforeLoad if exported from the route module.
        if (view && typeof view.beforeLoad === "function") {
          const url = new URL(to, window.location.href);
          try {
            const result = await view.beforeLoad({
              params: {},
              context: clientContext,
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
          commitWithTransition(locInit?.viewTransition, () => {
            applyPayload(data);
            setLocation(nextLocation);
            setCurrentModule(module);
            setCurrentLayouts(layoutModules);
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
          // The route can veto the background refetch via shouldRevalidate;
          // without one, the link's defaultShouldRevalidate decides.
          const gate = view?.shouldRevalidate;
          const byDefault = locInit?.defaultShouldRevalidate ?? true;
          const allowRefetch = gate
            ? gate({
                currentUrl: new URL(window.location.href),
                nextUrl: new URL(dataPath, window.location.origin),
                defaultShouldRevalidate: byDefault,
              })
            : byDefault;
          if (!allowRefetch) return;
          // Revalidate in background.
          void fetch(`/_data?path=${encodeURIComponent(dataPath)}`)
            .then((r) => {
              if (r.ok) return r.json();
              // The page no longer loads (e.g. a root loader now fails): drop
              // the stale entry and let the server render it, if still here.
              loaderCache.delete(key);
              if (window.location.pathname + window.location.search === dataPath) {
                window.location.assign(dataPath);
              }
              return null;
            })
            .then((fresh) => {
              if (!fresh) return;
              const freshData = reviveDeferred(fresh as Record<string, unknown>);
              loaderCache.set(key, freshData, staleTime, gcTime);
              startTransition(() => applyPayload(freshData));
            });
          return;
        }

        // Cache miss — fetch from server, inside the chain's clientMiddleware.
        const data = await runClientMiddleware(
          chain,
          { request: dataRequest, params: {}, context: clientContext },
          async () => {
            const res = await fetch(`/_data?path=${encodeURIComponent(dataPath)}`);
            // Layout and route loader errors arrive as a 200 with the error in
            // their slot. Anything else (a failed root loader, an unmatched
            // path, a search-validation 400, a 5xx) has no client-side
            // rendering: hand the navigation to the browser so the server
            // renders the real response. (Never parse a non-ok body as JSON.)
            if (!res.ok) {
              console.error(`[bractjs] /_data ${res.status} for ${to}`);
              window.location.assign(to);
              return null;
            }
            const payload = reviveDeferred((await res.json()) as Record<string, unknown>);
            // clientLoader (RR7-style) for root, each layout and the route: each
            // replaces its own slice, with serverLoader() resolving to the server
            // data. meta/matches stay as the server sent them.
            await applyClientLoaders(chain, payload, {
              request: dataRequest,
              params: (payload.params as Record<string, string>) ?? {},
              search: (payload.search as Record<string, unknown>) ?? {},
              context: clientContext,
            });
            return payload;
          },
        );
        if (!data) return false;

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
        // `throw redirect(...)` from clientMiddleware or a clientLoader.
        const loc = err instanceof Response ? err.headers.get("Location") : null;
        if (loc) {
          followRedirect(loc);
          return false;
        }
        console.error("[bractjs] loadRoute error:", err);
      } finally {
        setNavState("idle");
        setNavDetail({});
      }
    },
    [manifest, applyPayload, rootModule],
  );

  const navigate = useCallback(
    async (to: string, options?: NavigateOptions) => {
      const key = createLocationKey();
      const historyAction: HistoryAction = options?.replace ? "REPLACE" : "PUSH";
      // React Router-style blockers (useBlocker returning a blocker object).
      if (!options?.unblocked) {
        const nextLocation = toLocation(to, { key, state: options?.state });
        const blocker = findBlocker({ currentLocation: locationRef.current, nextLocation, historyAction });
        if (blocker) {
          blocker.onBlock(nextLocation, () => navigateRef.current(to, { ...options, unblocked: true }));
          return;
        }
      }
      const loaded = await loadRoute(to, {
        key,
        state: options?.state ?? null,
        defaultShouldRevalidate: options?.defaultShouldRevalidate,
        viewTransition: options?.viewTransition,
      });
      if (loaded === false) return;
      const entry = { __bractKey: key, __bractState: options?.state ?? null };
      if (options?.replace) history.replaceState(entry, "", to);
      else history.pushState(entry, "", to);
      setNavigationType(historyAction);
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
      const byDefault = info?.defaultShouldRevalidate ?? true;
      const allow = gate
        ? gate({
            currentUrl: url,
            nextUrl: url,
            formMethod: info?.formMethod,
            actionStatus: info?.actionStatus,
            formAction: info?.formAction,
            formData: info?.formData,
            actionResult: info?.actionResult,
            defaultShouldRevalidate: byDefault,
          })
        : byDefault;
      if (!allow) return;
      if (info?.formMethod) loaderCache.clear();
      setRevalidationState("loading");
      try {
        const chain: ClientChain = {
          root: rootModule,
          layouts: currentLayoutsRef.current,
          route: currentModuleRef.current,
        };
        const request = new Request(url);
        const context = createClientContext();
        const data = await runClientMiddleware(
          chain,
          { request, params: paramsRef.current, context },
          async () => {
            const res = await fetch(`/_data?path=${encodeURIComponent(path)}`);
            if (!res.ok) {
              // The current page no longer renders client-side (see loadRoute).
              console.error(`[bractjs] revalidate /_data ${res.status} for ${path}`);
              window.location.assign(path);
              return null;
            }
            const payload = reviveDeferred((await res.json()) as Record<string, unknown>);
            // Client loaders re-run too, so a revalidated page matches a navigation.
            await applyClientLoaders(chain, payload, {
              request,
              params: (payload.params as Record<string, string>) ?? {},
              search: (payload.search as Record<string, unknown>) ?? {},
              context,
            });
            return payload;
          },
        );
        if (data) commitWithTransition(info?.viewTransition, () => applyPayload(data));
      } catch (err) {
        const loc = err instanceof Response ? err.headers.get("Location") : null;
        if (loc) {
          const safe = toSamePath(loc);
          if (safe) void navigateRef.current(safe);
          else assignExternal(loc);
          return;
        }
        console.error("[bractjs] revalidate error:", err);
      } finally {
        setRevalidationState("idle");
      }
    },
    [applyPayload, rootModule],
  );

  // Let fetchers trigger revalidation without importing this component.
  useEffect(() => {
    registerRevalidator(revalidate);
    return () => registerRevalidator(null);
  }, [revalidate]);

  // …and soft-navigate (fetcher redirects, useSubmit GETs).
  useEffect(() => {
    registerNavigator((to, opts) => navigate(to, opts));
    return () => registerNavigator(null);
  }, [navigate]);

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
          context: createClientContext(),
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
      // React Router HydrateFallback: a clientLoader with `hydrate = true`
      // finishes the render — run it first, then swap the component in.
      const cl = moduleView(initialModule)?.clientLoader;
      if (typeof cl === "function" && cl.hydrate === true) {
        void (async () => {
          const path = window.location.pathname + window.location.search;
          const serverSlice = (initialData.loaderData as Record<string, unknown>)?.route;
          try {
            const next = await cl({
              request: new Request(new URL(path, window.location.origin)),
              params: initialData.params,
              search: initialData.search ?? {},
              context: createClientContext(),
              serverLoader: async () => serverSlice,
            });
            startTransition(() => {
              setLoaderData((prev) => ({ ...prev, route: next }));
              setHydrationPending(false);
            });
          } catch (err) {
            console.error("[bractjs] clientLoader (hydrate) error:", err);
            startTransition(() => setHydrationPending(false));
          }
        })();
        return;
      }
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
          const data = reviveDeferred((await res.json()) as Record<string, unknown>);
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
      const target = window.location.pathname + window.location.search + window.location.hash;
      const init = { key: st?.__bractKey ?? "default", state: st?.__bractState ?? null };
      // React Router-style blockers: the browser already moved, so put the
      // current entry back, and let `proceed()` re-run the navigation.
      const current = locationRef.current;
      const nextLocation = toLocation(target, init);
      const blocker = findBlocker({ currentLocation: current, nextLocation, historyAction: "POP" });
      if (blocker) {
        history.pushState(
          { __bractKey: current.key, __bractState: current.state },
          "",
          current.pathname + current.search + current.hash,
        );
        blocker.onBlock(nextLocation, () => navigate(target, { state: init.state, unblocked: true }));
        return;
      }
      setNavigationType("POP");
      void loadRoute(target, init);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadRoute, navigate]);

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
  /** The client modules (root, layouts, route) for a URL — submissions and fetchers. */
  const resolveChainFor = useCallback(
    async (path: string): Promise<{ chain: ClientChain; params: Record<string, string> }> => {
      const [pathname] = path.split("?");
      const pattern = matchPatternForPath(pathname, manifest);
      const entry = pattern !== null ? manifest.routes[pattern] : undefined;
      const [route, layouts] = await Promise.all([
        entry?.chunk
          ? (import(/* @vite-ignore */ entry.chunk) as Promise<RouteModuleClient>).catch(() => null)
          : null,
        loadLayoutModules(entry?.layouts),
      ]);
      return { chain: { root: rootModule, layouts, route }, params: {} };
    },
    [manifest, rootModule],
  );

  // Fetchers run the target route's client middleware/loaders/actions too.
  useEffect(() => {
    registerClientChainResolver(resolveChainFor);
    return () => registerClientChainResolver(null);
  }, [resolveChainFor]);

  const submit = useCallback(
    async (to: string, opts: RouterSubmitOptions) => {
      const body =
        opts.body === null ||
        typeof opts.body === "string" ||
        opts.body instanceof FormData ||
        opts.body instanceof URLSearchParams
          ? opts.body
          : new URLSearchParams(opts.body);
      const formData =
        body instanceof FormData
          ? body
          : body instanceof URLSearchParams
            ? (() => {
                const fd = new FormData();
                body.forEach((v, k) => fd.append(k, v));
                return fd;
              })()
            : undefined;
      setNavState("submitting");
      setNavDetail({
        formMethod: opts.method.toUpperCase(),
        formAction: to,
        formEncType:
          opts.contentType ??
          (body instanceof FormData ? "multipart/form-data" : "application/x-www-form-urlencoded"),
        formData,
        json: opts.json,
        text: opts.text,
      });
      try {
        // The server submit — also the `serverAction()` a clientAction can call.
        // A redirected response short-circuits to a real navigation (via
        // toSamePath so an attacker Location can never soft-nav the SPA); it
        // returns a sentinel so the caller stops.
        const REDIRECTED = Symbol("redirected");
        let lastStatus = 0;
        const doServerPost = async (): Promise<unknown> => {
          const headers: Record<string, string> = { "X-BractJS-Action": "1" };
          if (opts.contentType) headers["Content-Type"] = opts.contentType;
          const res = await fetch(to, {
            method: opts.method.toUpperCase(),
            body,
            headers,
          });
          lastStatus = res.status;
          // Preferred path: the server enveloped the action redirect
          // (204 + X-BractJS-Redirect) instead of a raw 3xx, so no throwaway
          // document GET ever happened — soft-nav straight to the target
          // (its /_data request is the first to present one-shot cookies).
          const envelope = res.headers.get("X-BractJS-Redirect");
          if (envelope !== null) {
            const safe = toSamePath(envelope);
            // redirectDocument(): a full document load, even same-origin.
            if (safe && res.headers.get("X-BractJS-Reload-Document") !== null) {
              window.location.assign(safe);
              return REDIRECTED;
            }
            if (safe) {
              // replace(): swap the history entry instead of pushing.
              await navigateRef.current(safe, {
                replace: res.headers.get("X-BractJS-Replace") !== null,
                viewTransition: opts.viewTransition,
              });
              return REDIRECTED;
            }
            assignExternal(envelope);
            return REDIRECTED;
          }
          if (res.redirected) {
            const safe = toSamePath(res.url);
            if (safe) {
              await navigateRef.current(safe, { viewTransition: opts.viewTransition });
              return REDIRECTED;
            }
            window.location.assign(res.url);
            return REDIRECTED;
          }
          return res.json();
        };

        // clientAction (RR7-style): if the target route exports one, it runs in
        // the browser and decides whether/how to hit the server via serverAction().
        const { chain } = await resolveChainFor(to);
        const clientAction = chain.route?.clientAction;
        const request = new Request(new URL(to, window.location.origin), {
          method: opts.method.toUpperCase(),
        });
        const context = createClientContext();

        let data: unknown;
        try {
          data = await runClientMiddleware(
            chain,
            { request, params: paramsRef.current, context },
            async () => {
              if (typeof clientAction !== "function") return doServerPost();
              return clientAction({
                request,
                params: paramsRef.current,
                formData: formData ?? new FormData(),
                context,
                serverAction: doServerPost,
              });
            },
          );
        } catch (err) {
          // `throw redirect(...)` from clientMiddleware or the clientAction.
          const loc = err instanceof Response ? err.headers.get("Location") : null;
          if (!loc) throw err;
          const safe = toSamePath(loc);
          if (safe) await navigateRef.current(safe, { viewTransition: opts.viewTransition });
          else assignExternal(loc);
          return;
        }
        // A redirect from the server action (directly or via serverAction()).
        if (data === REDIRECTED) return;

        setActionData(data);
        setNavState("loading");
        await revalidate({
          formMethod: opts.method,
          actionStatus: lastStatus,
          formAction: to,
          formData,
          actionResult: data,
          defaultShouldRevalidate: opts.defaultShouldRevalidate,
          viewTransition: opts.viewTransition,
        });
      } finally {
        setNavState("idle");
        setNavDetail({});
      }
    },
    [revalidate, resolveChainFor],
  );

  return (
    <RouterContext.Provider
      value={{
        rootErrorBoundary,
        currentLayouts,
        loaderData,
        actionData,
        params,
        pathname: location.pathname,
        location,
        search,
        matches,
        navigationType,
        manifest,
        currentModule,
        setRoute,
        revalidate,
        revalidationState,
        hydrationPending,
        locale,
        i18n: initialData.i18n,
      }}
    >
      <RequestIdContext.Provider value={requestId}>
        <NavigationContext.Provider value={{ state: navState, detail: navDetail, navigate, submit }}>
          <MetaTags meta={meta} />
          <LinkTags links={links} />
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
      </RequestIdContext.Provider>
    </RouterContext.Provider>
  );
}
