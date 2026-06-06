import type { ServerManifest } from "../server/render.ts";
import type { MetaDescriptor } from "../shared/route-types.ts";

// ── BractJSClientData ────────────────────────────────────────────────────

export interface BractJSClientData {
  loaderData: Record<string, unknown>;
  actionData: unknown;
  params: Record<string, string>;
  pathname: string;
  manifest: ServerManifest;
  /** Path of the matched route file, used to pre-import the module before hydration. */
  routeFile?: string;
  /** Merged meta descriptors for the current route — keeps <head> in sync. */
  meta?: MetaDescriptor[];
}

// ── Window augmentation ────────────────────────────────────────────────────

declare global {
  interface Window {
    __BRACTJS_DATA__: BractJSClientData;
    /** Dev-only: registered by ClientRouter for module-level HMR swaps. */
    __BRACTJS_HMR_ACCEPT__?: (pattern: string, mod: Record<string, unknown>) => void;
  }
}
