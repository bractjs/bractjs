import { createContext, useContext, type ComponentType } from "react";
import type { ServerManifest } from "../server/render.ts";

// ── Route module shape visible on the client ───────────────────────────────

export interface RouteModuleClient {
  default?: ComponentType;
  ErrorBoundary?: ComponentType<{ error: Error }>;
}

// ── Router Context ─────────────────────────────────────────────────────────

export interface RouteState {
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
}

export interface RouterContextValue extends RouteState {
  manifest: ServerManifest;
  currentModule: RouteModuleClient | null;
  setRoute(state: Partial<RouteState>): void;
}

export const RouterContext = createContext<RouterContextValue>(null!);

export function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (ctx === null) {
    throw new Error("useRouterContext must be used within a ClientRouter");
  }
  return ctx;
}

// ── Navigation Context ─────────────────────────────────────────────────────

export type NavigationState = "idle" | "loading" | "submitting";

export interface NavigationContextValue {
  state: NavigationState;
  navigate(to: string): Promise<void>;
  submit(to: string, options: { method: string; body: FormData | Record<string, string> }): Promise<void>;
}

export const NavigationContext = createContext<NavigationContextValue>(null!);

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (ctx === null) {
    throw new Error("useNavigationContext must be used within a ClientRouter");
  }
  return ctx;
}
