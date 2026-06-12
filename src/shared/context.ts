import { createContext, useContext, createElement, type ComponentType, type ReactNode } from "react";
import type { RouterLocation } from "./route-types.ts";

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
  /** The request's location, so `useLocation()` works during SSR (hash is always ""). */
  location?: RouterLocation;
  /** Validated search params (route `searchSchema` output), so `useSearch()` works during SSR. */
  search?: Record<string, unknown>;
}

export const BractJSContext = createContext<BractJSContextValue>(null!);

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
