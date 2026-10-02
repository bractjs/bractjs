import { type ComponentType, createContext, createElement, type ReactNode, useContext } from "react";
import type { I18nConfig } from "./i18n.ts";
import type { RouteMatch, RouterLocation } from "./route-types.ts";

export interface RouteManifest {
  [routeId: string]: {
    file: string;
    imports?: string[];
  };
}

export interface BractJSContextValue {
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  manifest: RouteManifest;
  /** SSR-only: the matched route's default export so <Outlet> can render it without ClientRouter */
  RouteComponent?: ComponentType;
  /**
   * SSR-only: the matched route's intermediate layout modules, outermost first
   * (index i ↔ `loaderData.layouts[i]`). <Outlet> renders each one's default
   * export around the next level.
   */
  LayoutModules?: Array<{ default?: ComponentType; ErrorBoundary?: ComponentType<{ error: unknown }> }>;
  /** SSR-only: root.tsx's ErrorBoundary, the outermost boundary a failed loader can reach. */
  RootErrorBoundary?: ComponentType<{ error: unknown }>;
  /** The request's location, so `useLocation()` works during SSR (hash is always ""). */
  location?: RouterLocation;
  /** Validated search params (route `searchSchema` output), so `useSearch()` works during SSR. */
  search?: Record<string, unknown>;
  /** The matched route chain (root → layouts → route) for `useMatches()`. */
  matches?: RouteMatch[];
  /** The page's locale (with `i18n` configured), for `useLocale()` during SSR. */
  locale?: string;
  /** The app's `i18n` config, for `useLocalizedLink()` during SSR. */
  i18n?: I18nConfig;
}

export const BractJSContext = createContext<BractJSContextValue>(null!);

/**
 * How deep in the root → layouts → route tree the nearest <Outlet> sits: the
 * one in root.tsx is level 0 and renders the first layout (or the route).
 */
export const OutletLevelContext = createContext(0);

/**
 * Which loader slice `useLoaderData()` returns: a layout's index into
 * `loaderData.layouts`, or null for the route. root.tsx sits outside every
 * provider, so it keeps reading the route's data as it always has.
 */
export const LoaderSliceContext = createContext<number | null>(null);

interface BractJSProviderProps {
  value: BractJSContextValue;
  children: ReactNode;
}

export function BractJSProvider({ value, children }: BractJSProviderProps) {
  return createElement(BractJSContext.Provider, { value }, children);
}

export function useBractJSContext(): BractJSContextValue {
  const ctx = useContext(BractJSContext);
  if (ctx === null) {
    throw new Error("useBractJSContext must be used within a BractJSProvider");
  }
  return ctx;
}
