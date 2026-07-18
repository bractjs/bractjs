import type { ModuleRegistry } from "./layout.ts";
import { type ServerManifest } from "./render.ts";
/**
 * Render the SPA-mode document shell: the app's root component around an
 * empty outlet, with `ssrMode: "spa"` in the bootstrap payload. Served for
 * every document GET when the config sets `ssr: false`; the client router
 * resolves the actual route (module + /_data) after hydration.
 *
 * The root renders with NO loader data (its loader does not run for the
 * shell) and a "/" location — roots that render loader- or location-dependent
 * markup are not compatible with SPA mode. Loaders/actions stay fully
 * functional at runtime: SPA mode means "no document SSR", not "no server".
 */
export declare function renderSpaShell(appDir: string, manifest: ServerManifest, registry?: ModuleRegistry): Promise<string>;
