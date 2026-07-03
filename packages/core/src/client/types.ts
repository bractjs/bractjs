import type { ServerManifest } from "../server/render.ts";
import type { MetaDescriptor, RouteMatch } from "../shared/route-types.ts";

// ── BractJSClientData ────────────────────────────────────────────────────

export interface BractJSClientData {
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  /** Validated search params for the initial request (route `searchSchema` output). */
  search?: Record<string, unknown>;
  manifest: ServerManifest;
  /** Path of the matched route file, used to pre-import the module before hydration. */
  routeFile?: string;
  /** Merged meta descriptors for the current route — keeps <head> in sync. */
  meta?: MetaDescriptor[];
  /** Matched route chain (root → layouts → route) powering `useMatches()`. */
  matches?: RouteMatch[];
  /** Present when the document did not SSR the route component (selective SSR / SPA shell). */
  ssrMode?: "client-only" | "data-only" | "spa";
}

// ── Window augmentation ────────────────────────────────────────────────────

declare global {
  interface Window {
    __BRACTJS_DATA__: BractJSClientData;
    /** Dev-only: registered by ClientRouter for module-level HMR swaps. */
    __BRACTJS_HMR_ACCEPT__?: (pattern: string, mod: Record<string, unknown>) => void;
    /** Dev-only: HMR WebSocket port published by the server's dev bootstrap. */
    __BRACTJS_HMR_PORT__?: number;
  }
}
