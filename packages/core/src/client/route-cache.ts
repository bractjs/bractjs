import { type ComponentType, type LazyExoticComponent, lazy } from "react";

// ── Route Cache ────────────────────────────────────────────────────────────

// Keyed by chunkUrl so React.lazy is only created once per chunk.
const routeCache = new Map<string, LazyExoticComponent<ComponentType>>();

/**
 * Returns a React.lazy component for the given chunk URL.
 * Caches by chunkUrl so re-renders don't create new lazy references.
 */
export function getLazyRoute(chunkUrl: string): LazyExoticComponent<ComponentType> {
  if (!routeCache.has(chunkUrl)) {
    routeCache.set(
      chunkUrl,
      lazy(() => import(chunkUrl) as Promise<{ default: ComponentType }>),
    );
  }
  return routeCache.get(chunkUrl)!;
}
