import { createContext, useContext, createElement, type ComponentType, type ReactNode } from "react";

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
