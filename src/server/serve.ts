import { scanRoutes } from "./scanner.ts";
import { buildTrie } from "./matcher.ts";
import { handleRequest, type HandlerConfig } from "./request-handler.ts";
import { type ServerManifest } from "./render.ts";
import { isDevRuntime, isExplicitDev } from "./env.ts";
import { loadManifest } from "../build/manifest.ts";
import { serveStatic } from "./static.ts";
import { handleImageRequest } from "../image/handler.ts";
import { loadServerActions } from "./action-registry.ts";
import { handleActionRequest } from "./action-handler.ts";
import { BunAdapter, type BractAdapter } from "./adapter.ts";
import { resolve, join } from "node:path";

export interface I18nConfig {
  locales: string[];
  defaultLocale: string;
}

export interface BractJSConfig {
  port: number;
  appDir: string;
  publicDir: string;
  manifest: ServerManifest;
  /** Optional custom adapter (Cloudflare Workers, Deno, Node, etc.). Defaults to Bun.serve(). */
  adapter?: BractAdapter;
  /** i18n locale prefix routing (E2). */
  i18n?: I18nConfig;
  // Build options (used by src/build/bundler.ts)
  sourcemap?: "none" | "linked" | "inline" | "external";
  minify?: boolean;
  clientEnv?: string[];
  buildDir?: string;
  /** Directory for transformed image cache. Defaults to .bract-image-cache */
  imageCacheDir?: string;
  /** Called once after the server starts listening. Use to open DB connections, warm caches, etc. */
  onStart?: () => Promise<void> | void;
  /** Called before the process exits (any signal or uncaught error). Use to close DB connections, flush queues, etc. */
  onShutdown?: () => Promise<void> | void;
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

/**
 * Build the core application fetch handler.
 * This is adapter-agnostic: it returns a (request) => Promise<Response> function
 * that any adapter can call.
 */
export function buildFetchHandler(config: Partial<BractJSConfig>) {
  const appDir = resolve(config.appDir ?? "./app");
  const publicDir = resolve(config.publicDir ?? "./public");
  const buildDir = resolve(config.buildDir ?? "./build");
  const imageCacheDir = resolve(config.imageCacheDir ?? ".bract-image-cache");

  const manifestReady: Promise<ServerManifest> = !isDevRuntime() && !config.manifest
    ? loadManifest(buildDir).then((m) => ({
        clientEntry: m.clientEntry,
        rootChunk: m.rootChunk,
        routes: Object.fromEntries(
          Object.entries(m.routes).map(([pat, e]) => [pat, { file: e.chunk, chunk: e.chunk }]),
        ),
      }))
    : Promise.resolve(config.manifest ?? DEFAULT_MANIFEST);

  const trieReady = scanRoutes(appDir).then(buildTrie);
  const actionsReady = loadServerActions(appDir);

  return async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Dev-only: on-demand module compilation for HMR module swap.
    // SECURITY(high): use isExplicitDev() (NODE_ENV === "development") rather
    // than isDev() (NODE_ENV !== "production"). An operator who forgets to set
    // NODE_ENV would otherwise expose /_hmr/module in production, letting
    // anyone compile and download arbitrary appDir .ts/.tsx files as JS.
    if (isExplicitDev() && pathname === "/_hmr/module") {
      const { handleHmrModuleRequest } = await import("../dev/hmr-module-handler.ts");
      return handleHmrModuleRequest(url, appDir);
    }

    // Dev-only: serve the DevTools panel module imported by hmr-client.
    // SECURITY(high): gated by isExplicitDev() so production never compiles
    // and ships package internals as JS.
    if (isExplicitDev() && pathname === "/_bractjs/devtools.js") {
      const devtoolsEntry = resolve(import.meta.dir, "../dev/devtools.ts");
      const built = await Bun.build({
        entrypoints: [devtoolsEntry],
        target: "browser",
        minify: false,
        sourcemap: "inline",
      });
      if (!built.success || built.outputs.length === 0) {
        return new Response("DevTools build failed", { status: 500 });
      }
      return new Response(await built.outputs[0].text(), {
        headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" },
      });
    }

    // Typed API routes (registered via bract.route())
    if (pathname.startsWith("/api")) {
      const { handleApiRequest } = await import("./api-route.ts");
      const apiRes = await handleApiRequest(request);
      if (apiRes) return apiRes;
    }

    // Server actions endpoint (exact path; handler also validates).
    if (pathname === "/_action") {
      await actionsReady;
      const actionRes = await handleActionRequest(request);
      if (actionRes) return actionRes;
    }

    // SSE streaming endpoint for async-generator server actions.
    if (pathname === "/_stream") {
      await actionsReady;
      const { handleStreamRequest } = await import("./stream-handler.ts");
      const streamRes = await handleStreamRequest(request);
      if (streamRes) return streamRes;
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
    const manifest = isDevRuntime() ? await readDevManifest(buildDir) : await manifestReady;
    const handlerConfig: HandlerConfig = { appDir, publicDir, manifest };
    return handleRequest(request, trie, handlerConfig);
  };
}

/**
 * In production-runtime mode, surface a warning when the manifest on disk
 * wasn't produced by `bractjs build` (missing `"mode": "production"`).
 * Almost always means the user is running `bractjs start` against a dev
 * rebuilder's manifest, or hasn't run `bractjs build` at all.
 */
async function warnIfStaleBuild(buildDir: string): Promise<void> {
  const f = Bun.file(join(buildDir, "route-manifest.json"));
  if (!(await f.exists())) {
    console.warn(`[bract] No build found at ${buildDir}/route-manifest.json. Run \`bractjs build\` before \`bractjs start\`.`);
    return;
  }
  try {
    const m = (await f.json()) as { mode?: string };
    if (m.mode !== "production") {
      console.warn(`[bract] Build at ${buildDir} was not produced by \`bractjs build\` (mode=${m.mode ?? "unset"}). Re-run \`bractjs build\` for a production-ready manifest.`);
    }
  } catch {
    // Malformed manifest — the request path will surface the real error.
  }
}

// Module-level guards so signal handlers are registered exactly once across
// HMR restarts and multiple createServer() calls in the same process.
let signalsRegistered = false;
let isShuttingDown = false;

export function createServer(config?: Partial<BractJSConfig>): {
  stop(): void;
} {
  const port = config?.port ?? 3000;

  if (!isDevRuntime()) {
    void warnIfStaleBuild(resolve(config?.buildDir ?? "./build"));
  }

  const fetchHandler = buildFetchHandler(config ?? {});

  // Use provided adapter or fall back to the default Bun adapter.
  const adapter = config?.adapter ?? new BunAdapter();

  if (adapter instanceof BunAdapter) {
    adapter.setHandler(fetchHandler);
    adapter.listen(port);
  } else {
    // Custom adapter: wire fetch handler in and call listen if available.
    if ("setHandler" in adapter && typeof (adapter as unknown as { setHandler: unknown }).setHandler === "function") {
      (adapter as unknown as { setHandler: (h: (r: Request) => Promise<Response>) => void }).setHandler(fetchHandler);
    }
    adapter.listen?.(port);
  }

  console.log(`[bract] Server running at http://localhost:${port}`);

  const stopAdapter = () => {
    if (adapter instanceof BunAdapter) {
      adapter.stop();
    } else if ("stop" in adapter && typeof (adapter as unknown as { stop: unknown }).stop === "function") {
      (adapter as unknown as { stop: () => void }).stop();
    }
  };

  const gracefulShutdown = async (signal?: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (signal) console.log(`\n[bract] Received ${signal}, shutting down…`);
    try {
      await config?.onShutdown?.();
    } catch (err) {
      console.error("[bract] onShutdown error:", err);
    }
    stopAdapter();
    process.exit(0);
  };

  if (!signalsRegistered) {
    signalsRegistered = true;
    process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
    process.on("SIGINT",  () => void gracefulShutdown("SIGINT"));
    process.on("SIGUSR2", () => void gracefulShutdown("SIGUSR2"));
    process.on("beforeExit", () => void gracefulShutdown());
    process.on("uncaughtException", (err) => {
      console.error("[bract] Uncaught exception:", err);
      void gracefulShutdown("uncaughtException");
    });
  }

  void Promise.resolve(config?.onStart?.()).catch((err) => {
    console.error("[bract] onStart error:", err);
  });

  return {
    stop() { void gracefulShutdown(); },
  };
}

// Allow running directly: bun run src/server/serve.ts
if (import.meta.main) {
  createServer();
}
