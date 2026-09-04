import { type ComponentType, type LazyExoticComponent } from "react";
/**
 * Returns a React.lazy component for the given chunk URL.
 * Caches by chunkUrl so re-renders don't create new lazy references.
 */
export declare function getLazyRoute(chunkUrl: string): LazyExoticComponent<ComponentType>;
