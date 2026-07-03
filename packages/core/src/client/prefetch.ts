import type { ServerManifest } from "../server/render.ts";
import { cacheKey, loaderCache } from "./cache.ts";
import { matchPatternForPath, parseTo } from "./nav-utils.ts";

// ── State ──────────────────────────────────────────────────────────────────

/** In-flight prefetches by path — concurrent callers share one task. */
const inflight = new Map<string, Promise<void>>();

/** Chunk hrefs already given a <link rel="modulepreload"> tag. */
const preloadedChunks = new Set<string>();

// Cap concurrent /_data prefetches so viewport-prefetching a long list of
// links cannot stampede the server. Chunk modulepreload is cheap (served
// immutable from cache) and stays uncapped.
const MAX_DATA_PREFETCHES = 6;
let activeDataPrefetches = 0;

// Prefetched data gets at least this freshness window so a hover→click within
// it commits straight from cache with zero extra requests (same idea as
// TanStack Router's preloadStaleTime). Routes with a longer `config.staleTime`
// keep their own.
const PREFETCH_STALE_TIME = 30_000;
const PREFETCH_GC_TIME = 60_000;

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Prefetches the route chunk (via `<link rel="modulepreload">`) and warms the
 * loader cache for the given path, under the same cache key the router
 * computes — so the eventual navigation commits instantly. Best-effort and
 * de-duplicated; safe to call on every hover.
 */
export function prefetchRoute(path: string, manifest: ServerManifest): Promise<void> {
  const existing = inflight.get(path);
  if (existing) return existing;

  const task = doPrefetch(path, manifest)
    .catch(() => {
      /* prefetch is best-effort — never surface errors */
    })
    .finally(() => {
      inflight.delete(path);
    });
  inflight.set(path, task);
  return task;
}

async function doPrefetch(path: string, manifest: ServerManifest): Promise<void> {
  const { pathname, search } = parseTo(path);
  const pattern = matchPatternForPath(pathname, manifest);
  const chunk = pattern !== null ? manifest.routes[pattern]?.chunk : undefined;

  // 1. Warm the route chunk.
  if (chunk && !preloadedChunks.has(chunk)) {
    preloadedChunks.add(chunk);
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = chunk;
    document.head.appendChild(link);
  }

  // 2. Warm the loader cache. Importing the (already preloaded) chunk yields
  //    config/loaderDeps, which the router uses to key the cache — without the
  //    module we fall back to the path-keyed default, matching loadRoute.
  const mod = chunk
    ? ((await import(/* @vite-ignore */ chunk).catch(() => null)) as Record<string, unknown> | null)
    : null;
  const routeConfig = mod?.config as { staleTime?: number; gcTime?: number } | undefined;
  const loaderDepsFn = mod?.loaderDeps as
    ((args: { searchParams: URLSearchParams }) => unknown[]) | undefined;
  const dataPath = pathname + search;
  const deps = loaderDepsFn ? loaderDepsFn({ searchParams: new URLSearchParams(search) }) : [dataPath];
  const key = cacheKey(pathname, deps);

  if (loaderCache.get(key)?.fresh) return; // already warm
  if (activeDataPrefetches >= MAX_DATA_PREFETCHES) return;

  activeDataPrefetches++;
  try {
    const res = await fetch(`/_data?path=${encodeURIComponent(dataPath)}`, {
      priority: "low",
    } as RequestInit);
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, unknown>;
    loaderCache.set(
      key,
      data,
      Math.max(routeConfig?.staleTime ?? 0, PREFETCH_STALE_TIME),
      Math.max(routeConfig?.gcTime ?? 0, PREFETCH_GC_TIME),
    );
  } finally {
    activeDataPrefetches--;
  }
}

// ── Viewport observation (shared) ──────────────────────────────────────────

const observedCallbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

/**
 * Fire `callback` once when `el` first enters the viewport, via one shared
 * IntersectionObserver (per-element observers are a perf trap on long lists).
 * Returns an unsubscribe function. Environments without IntersectionObserver
 * fire immediately.
 */
export function observeOnce(el: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    callback();
    return () => {};
  }
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const fire = observedCallbacks.get(entry.target);
        observedCallbacks.delete(entry.target);
        observer!.unobserve(entry.target);
        if (fire) fire();
      }
    });
  }
  observedCallbacks.set(el, callback);
  observer.observe(el);
  return () => {
    observedCallbacks.delete(el);
    observer?.unobserve(el);
  };
}
