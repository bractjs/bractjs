import { scanRoutes } from "./scanner.ts";
import { buildTrie } from "./matcher.ts";
import { handleRequest, type HandlerConfig } from "./request-handler.ts";
import { type ServerManifest } from "./render.ts";
import { isDev } from "./env.ts";
import { loadManifest } from "../build/manifest.ts";
import { serveStatic } from "./static.ts";
import { handleImageRequest } from "../image/handler.ts";
import { loadServerActions } from "./action-registry.ts";
import { handleActionRequest } from "./action-handler.ts";
import { resolve, join } from "node:path";

export interface BractJSConfig {
  port: number;
  appDir: string;
  publicDir: string;
  manifest: ServerManifest;
  // Build options (used by src/build/bundler.ts)
  sourcemap?: "none" | "linked" | "inline" | "external";
  minify?: boolean;
  clientEnv?: string[];
  buildDir?: string;
  /** Directory for transformed image cache. Defaults to .bract-image-cache */
  imageCacheDir?: string;
}

const DEFAULT_MANIFEST: ServerManifest = {
  clientEntry: "/build/client/client.js",
  routes: {},
};

/**
 * In dev mode: read the manifest from disk on every request so that rebuilds
 * are reflected immediately without restarting the server.
 * The manifest is written by rebuildClient() in src/dev/rebuilder.ts.
 */
async function readDevManifest(buildDir: string): Promise<ServerManifest> {
  const f = Bun.file(join(buildDir, "route-manifest.json"));
  if (!(await f.exists())) return DEFAULT_MANIFEST;
  const m = await f.json() as { clientEntry?: string; rootChunk?: string; routes?: Record<string, { chunk?: string }> };
  return {
    clientEntry: m.clientEntry ?? DEFAULT_MANIFEST.clientEntry,
    rootChunk: m.rootChunk,
    routes: Object.fromEntries(
      Object.entries(m.routes ?? {}).map(([pat, e]) => [pat, { file: e.chunk ?? "", chunk: e.chunk }]),
    ),
  };
}

export function createServer(config?: Partial<BractJSConfig>): {
  server: ReturnType<typeof Bun.serve>;
  stop(): void;
} {
  const port = config?.port ?? 3000;
  const appDir = resolve(config?.appDir ?? "./app");
  const publicDir = resolve(config?.publicDir ?? "./public");
  const buildDir = resolve(config?.buildDir ?? "./build");
  const imageCacheDir = resolve(config?.imageCacheDir ?? ".bract-image-cache");

  // In production, load the pre-built manifest; otherwise use provided or default
  const manifestReady: Promise<ServerManifest> = !isDev() && !config?.manifest
    ? loadManifest(buildDir).then((m) => ({
        clientEntry: m.clientEntry,
        rootChunk: m.rootChunk,
        routes: Object.fromEntries(
          Object.entries(m.routes).map(([pat, e]) => [pat, { file: e.chunk, chunk: e.chunk }]),
        ),
      }))
    : Promise.resolve(config?.manifest ?? DEFAULT_MANIFEST);

  // Build route trie and register server actions concurrently at startup.
  const trieReady = scanRoutes(appDir).then(buildTrie);
  const actionsReady = loadServerActions(appDir);

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const { pathname } = url;

      // Dev-only: on-demand module compilation for HMR module swap
      if (isDev() && pathname === "/_hmr/module") {
        const { handleHmrModuleRequest } = await import("../dev/hmr-module-handler.ts");
        return handleHmrModuleRequest(url, appDir);
      }

      // Server actions endpoint
      if (pathname.startsWith("/_action")) {
        await actionsReady;
        const actionRes = await handleActionRequest(request);
        if (actionRes) return actionRes;
      }

      // Image optimization endpoint
      if (pathname === "/_image") {
        const imgRes = await handleImageRequest(request, publicDir, imageCacheDir);
        if (imgRes) return imgRes;
      }

      // Serve hashed client assets + public/ with correct cache headers
      const staticRes = await serveStatic(pathname, buildDir, publicDir);
      if (staticRes) return staticRes;

      const trie = await trieReady;
      const manifest = isDev() ? await readDevManifest(buildDir) : await manifestReady;
      const handlerConfig: HandlerConfig = { appDir, publicDir, manifest };
      return handleRequest(request, trie, handlerConfig);
    },
    // Return JSON for any uncaught exception so the client's r.json() never sees
    // plain-text "Internal Server Error" bodies → prevents JSON.parse errors.
    error(err: Error) {
      console.error("[bractjs] unhandled server error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },
  });

  console.log(`[bract] Server running at http://localhost:${port}`);

  return {
    server,
    stop() { server.stop(); },
  };
}

// Allow running directly: bun run src/server/serve.ts
if (import.meta.main) {
  createServer();
}
