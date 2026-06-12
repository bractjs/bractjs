import { scanRoutes, type RouteFile } from "./scanner.ts";
import { buildTrie, matchRoute } from "./matcher.ts";
import { handleRequest, type HandlerConfig } from "./request-handler.ts";
import { renderSpaShell } from "./spa.ts";
import { type ServerManifest } from "./render.ts";
import { isDevRuntime, isExplicitDev } from "./env.ts";
import { loadManifest } from "../build/manifest.ts";
import { serveStatic } from "./static.ts";
import { handleImageRequest } from "../image/handler.ts";
import { loadServerActions, loadServerActionsFromRegistry } from "./action-registry.ts";
import { handleActionRequest } from "./action-handler.ts";
import { BunAdapter, type BractAdapter } from "./adapter.ts";
import type { ModuleRegistry } from "./layout.ts";
import { resolve, join } from "node:path";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";
import { installUseClientServerStub } from "./use-client-runtime.ts";

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
  /**
   * SPA mode: `false` serves one static shell for every document GET instead
   * of SSR. The server keeps running — /_data, actions, /_image, API routes
   * and static assets behave exactly as in SSR mode ("no document SSR", not
   * "no server"). Default `true`.
   */
  ssr?: boolean;
  /**
   * Paths to prerender at build time (SSG). Served from disk before dynamic
   * SSR in production; requests with a query string stay dynamic.
   */
  prerender?: string[] | (() => string[] | Promise<string[]>);
  // Build options (used by src/build/bundler.ts)
  sourcemap?: "none" | "linked" | "inline" | "external";
  minify?: boolean;
  clientEnv?: string[];
  /** User Bun bundler plugins appended to the client build (e.g. bun-plugin-tailwind). */
  plugins?: import("bun").BunPlugin[];
  buildDir?: string;
  /** Directory for transformed image cache. Defaults to .bract-image-cache */
  imageCacheDir?: string;
  /** Called once after the server starts listening. Use to open DB connections, warm caches, etc. */
  onStart?: () => Promise<void> | void;
  /** Called before the process exits (any signal or uncaught error). Use to close DB connections, flush queues, etc. */
  onShutdown?: () => Promise<void> | void;
  /** Called for every unexpected error: loader failures, action throws, and uncaught process exceptions. Redirects and HttpErrors are intentional control flow and are NOT reported here. The request is undefined for process-level exceptions. */
  onError?: OnErrorHook;
  /**
   * Pre-scanned route list (typically exported from `app/_generated/routes.ts`).
   * When provided, skips the startup `Bun.Glob` scan of `appDir`. Required for
   * `bun build --compile` binaries where the embedded filesystem has no
   * scannable routes/ directory.
   */
  routeFiles?: RouteFile[];
  /**
   * Pre-loaded route/layout/root modules keyed by appDir-relative path.
   * Required alongside `routeFiles` for compiled binaries — `resolveRouteChain`
   * uses this map instead of `import(absPath)` at request time.
   */
  moduleRegistry?: ModuleRegistry;
  /**
   * Pre-imported server-action modules (typically `app/_generated/actions.ts`).
   * When provided, skips the startup `Bun.Glob` scan + dynamic import that
   * `loadServerActions` does.
   */
  actionModules?: Array<{ relPath: string; mod: Record<string, unknown> }>;
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

  // When routes are imported from SOURCE at runtime (dev server AND
  // `bractjs start`, which fall back to scanRoutes + dynamic import rather than
  // a pre-stubbed compiled bundle), a `"use client"` route component would
  // execute during SSR and crash on browser-only hooks. Install the runtime
  // stub that null-renders such modules on the server — parity with the
  // compiled bundle's useClientStubPlugin. Skipped on the compiled path, which
  // supplies a pre-built moduleRegistry.
  if (!config.moduleRegistry) installUseClientServerStub(appDir);

  // Codegen / compiled-binary path: when the caller supplies pre-scanned
  // routes, skip the runtime `Bun.Glob` scan that `bun build --compile`
  // can't satisfy (the routes/ directory isn't on the filesystem in a
  // single-binary deployment). Same idea for server actions.
  const trieReady = config.routeFiles
    ? Promise.resolve(buildTrie(config.routeFiles))
    : scanRoutes(appDir).then(buildTrie);
  const actionsReady = config.actionModules
    ? loadServerActionsFromRegistry(config.actionModules)
    : loadServerActions(appDir);
  const moduleRegistry = config.moduleRegistry;
  const onError = config.onError;
  const ssrEnabled = config.ssr !== false;

  // SPA shell: production prefers the file `bractjs build` wrote; dev (or a
  // missing file) renders it on demand so root.tsx edits show up. Cached per
  // manifest in prod-without-file; never cached in dev.
  let spaShellCache: { key: string; html: string } | null = null;
  async function getSpaShell(manifest: ServerManifest): Promise<string> {
    if (!isDevRuntime()) {
      const file = Bun.file(join(buildDir, "client", "__spa.html"));
      if (await file.exists()) return file.text();
      const key = manifest.clientEntry;
      if (spaShellCache?.key === key) return spaShellCache.html;
      const html = await renderSpaShell(appDir, manifest, moduleRegistry);
      spaShellCache = { key, html };
      return html;
    }
    return renderSpaShell(appDir, manifest, moduleRegistry);
  }

  /** Prerendered file for a clean (query-free, dot-free) document path, or null. */
  function prerenderFile(relHtmlOrJson: string): ReturnType<typeof Bun.file> | null {
    if (relHtmlOrJson.split("/").some((s) => s === ".." || s === ".")) return null;
    return Bun.file(join(buildDir, "client", "_prerender", relHtmlOrJson));
  }

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
    const isDocGet = request.method === "GET" || request.method === "HEAD";

    // SPA mode: every document GET that matches a route gets the static
    // shell. /_data (no trie match) and mutations fall through to the normal
    // handler, so loaders/actions/CSRF behave exactly as in SSR mode.
    if (!ssrEnabled && isDocGet && matchRoute(pathname, trie)) {
      const manifest = isDevRuntime() ? await readDevManifest(buildDir) : await manifestReady;
      return new Response(await getSpaShell(manifest), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Prerendered output (production): serve the build-time HTML / _data
    // payload for clean URLs. A query string opts the request back into
    // dynamic SSR — the static file was rendered without one.
    if (!isDevRuntime() && isDocGet) {
      if (pathname === "/_data") {
        const target = url.searchParams.get("path") ?? "/";
        const [targetPathname, targetSearch] = target.split("?");
        if (!targetSearch) {
          const rel = targetPathname === "/" ? "_data.json" : targetPathname.slice(1) + "/_data.json";
          const f = prerenderFile(rel);
          if (f && (await f.exists())) {
            return new Response(f, {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=0, must-revalidate",
              },
            });
          }
        }
      } else if (!url.search) {
        const rel = pathname === "/" ? "index.html" : pathname.slice(1) + "/index.html";
        const f = prerenderFile(rel);
        if (f && (await f.exists())) {
          return new Response(f, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=0, must-revalidate",
            },
          });
        }
      }
    }

    const manifest = isDevRuntime() ? await readDevManifest(buildDir) : await manifestReady;
    const handlerConfig: HandlerConfig = { appDir, publicDir, manifest, onError, moduleRegistry };
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
let activeOnShutdown: (() => Promise<void> | void) | undefined;
let activeOnError: OnErrorHook | undefined;

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

  activeOnShutdown = config?.onShutdown;
  activeOnError = config?.onError;

  console.log(`[bract] Server running at http://localhost:${port}`);

  const stopAdapter = () => {
    if (adapter instanceof BunAdapter) {
      adapter.stop();
    } else if ("stop" in adapter && typeof (adapter as unknown as { stop: unknown }).stop === "function") {
      (adapter as unknown as { stop: () => void }).stop();
    }
  };

  // Programmatic / beforeExit path — runs the user hook, stops the adapter,
  // and returns. Does NOT call process.exit() so callers (tests, parent
  // supervisors) can keep running. `gracefulShutdown` below wraps this and
  // adds an explicit exit for signal handlers, where termination is the
  // whole point.
  const shutdownOnce = async (signal?: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (signal) console.log(`\n[bract] Received ${signal}, shutting down…`);
    try {
      const result = activeOnShutdown?.();
      if (result instanceof Promise) {
        try { await result; }
        catch (err) { console.error("[bract] onShutdown error:", err); }
      }
    } catch (err) {
      console.error("[bract] onShutdown error:", err);
    } finally {
      stopAdapter();
    }
  };

  const gracefulShutdown = (signal?: string, exitCode = 0): void => {
    void shutdownOnce(signal).finally(() => process.exit(exitCode));
  };

  if (!signalsRegistered) {
    signalsRegistered = true;
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
    // `beforeExit` fires when the event loop is naturally draining — we
    // already shut down the adapter at that point, but we must NOT call
    // process.exit(). Doing so re-enters the lifecycle and prevents test
    // runners (and any parent process supervising us) from observing a
    // clean exit code. Just run the user hook + stop the listener.
    process.on("beforeExit", () => { void shutdownOnce(); });
    process.on("uncaughtException", (err) => {
      console.error("[bract] Uncaught exception:", err);
      void fireOnError(activeOnError, err).then(() => gracefulShutdown("uncaughtException", 1));
    });
  }

  void Promise.resolve(config?.onStart?.()).catch((err) => {
    console.error("[bract] onStart error:", err);
  });

  return {
    // Programmatic stop — runs `onShutdown`, then closes the listener. Does
    // NOT call `process.exit()`. Tests rely on this so the runner can print
    // its summary; long-running supervisors rely on it so a stop() doesn't
    // tear down the whole worker. Use SIGTERM/SIGINT if you actually want
    // the process to exit.
    stop() { void shutdownOnce(); },
  };
}

// Allow running directly: bun run src/server/serve.ts
if (import.meta.main) {
  createServer();
}
