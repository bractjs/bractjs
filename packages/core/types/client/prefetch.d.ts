import type { ServerManifest } from "../server/render.ts";
/**
 * Prefetches the route chunk (via `<link rel="modulepreload">`) and warms the
 * loader cache for the given path, under the same cache key the router
 * computes — so the eventual navigation commits instantly. Best-effort and
 * de-duplicated; safe to call on every hover.
 */
export declare function prefetchRoute(path: string, manifest: ServerManifest): Promise<void>;
/**
 * Fire `callback` once when `el` first enters the viewport, via one shared
 * IntersectionObserver (per-element observers are a perf trap on long lists).
 * Returns an unsubscribe function. Environments without IntersectionObserver
 * fire immediately.
 */
export declare function observeOnce(el: Element, callback: () => void): () => void;
