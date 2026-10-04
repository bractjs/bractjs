import { join, resolve } from "node:path";
import { loadManifest } from "../build/manifest.ts";
import { handleImageRequest } from "../image/handler.ts";
import { handleActionRequest } from "./action-handler.ts";
import { loadServerActions, loadServerActionsFromRegistry } from "./action-registry.ts";
import type { I18nConfig } from "../shared/i18n.ts";
import { DenoAdapter } from "../adapters/deno.ts";
import { NodeAdapter } from "../adapters/node.ts";
import { type BractAdapter, BunAdapter } from "./adapter.ts";
import { privateWhenSettingCookies } from "./cache.ts";
import { createIsr, ISR_REGEN_HEADER, registerIsr } from "./isr.ts";
import { registerSiteSource } from "./sitemap.ts";
import { withCompression } from "./compression.ts";
import { isAllowedDevHost } from "./dev-host.ts";
import { envPort, isDevRuntime, isExplicitDev, parsePort } from "./env.ts";
import type { ModuleRegistry } from "./layout.ts";
import { fireOnError, type OnErrorHook } from "./lifecycle.ts";
import { buildTrie, matchRoute } from "./matcher.ts";
import { instrument, type Instrumentation, instrumentRequest } from "./instrumentation.ts";
import { createMiddlewareContext, type MiddlewareContext, pipeline } from "./middleware.ts";
import type { ServerManifest } from "./render.ts";
import { runWithRequest } from "./request-context.ts";
import { type HandlerConfig, handleRequest } from "./request-handler.ts";
import { error } from "./response.ts";
import { type RouteFile, scanRoutes } from "./scanner.ts";
import { renderSpaShell } from "./spa.ts";
import { embeddedFile } from "./embedded.ts";
import { serveStatic } from "./static.ts";
import { installCssModulesRuntime } from "./css-modules-runtime.ts";
import { installUseClientServerStub } from "./use-client-runtime.ts";
import { fileBody, fileExists, readText } from "./runtime.ts";

export type { I18nConfig } from "../shared/i18n.ts";

export interface BractJSConfig {
  port: number;
  appDir: string;
  publicDir: string;
  manifest: ServerManifest;
  /** WebSocket port for dev HMR (used by `bractjs dev` only). Default 3001. */
  hmrPort?: number;
  /**
   * Interface to listen on. Default: all interfaces for `bractjs start` / the
   * compiled binary; `127.0.0.1` under `bractjs dev` (pass `--host` or set
   * this to expose the dev server on your network).
   */
  hostname?: string;
  /**
   * Dev only: extra `Host` header names the dev server accepts, beyond
   * `localhost`, `*.localhost` and IP literals (a leading dot allows
   * subdomains: `".example.test"`). Other names are rejected with 403 to block
   * DNS-rebinding reads of dev-only endpoints.
   */
  allowedHosts?: string[];
  /** Optional custom adapter (Cloudflare Workers, Deno, Node, etc.). Defaults to Bun.serve(). */
  adapter?: BractAdapter;
  /**
   * Locale-prefixed URLs: `{ locales: ["en", "fr"], defaultLocale: "en" }`
   * serves `/about` in English and `/fr/about` in French from the same route
   * files. See README §19.
   */
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
  /** Client bundle sourcemaps. Default `"none"`: build/client/ is publicly served, so maps would publish module source. */
  sourcemap?: "none" | "linked" | "inline" | "external";
  minify?: boolean;
  clientEnv?: string[];
  /** User Bun bundler plugins appended to the client build. */
  plugins?: import("bun").BunPlugin[];
  /**
   * Compile Tailwind v4 as part of the CSS graph. Requires `bun-plugin-tailwind`
   * and `tailwindcss` in the app's devDependencies; import a stylesheet
   * containing `@import "tailwindcss";` from `app/root.tsx` (or a route) and
   * BractJS extracts, hashes, and `<link>`s it — no CLI step, no manual tag.
   */
  tailwind?: boolean;
  buildDir?: string;
  /** Directory for transformed image cache. Defaults to .bract-image-cache */
  imageCacheDir?: string;
  /**
   * Hard ceiling (bytes) on the size of any incoming request body, enforced by
   * the Bun adapter regardless of the advertised Content-Length. Defaults to
   * 16 MiB — above the 10 MiB route-form cap so normal requests pass while a
   * single client can't stream an unbounded body into memory. Raise it for a
   * dedicated large-upload endpoint. Only applies to the default Bun adapter.
   */
  maxRequestBodySize?: number;
  /**
   * Compress responses (brotli, else gzip — whichever the client accepts) for
   * HTML, JSON, JS, CSS, SVG and other text. Default `true`. Hashed client
   * assets are compressed once at maximum quality and cached in memory;
   * streamed SSR stays streamed. Set `false` when a reverse proxy or CDN in
   * front already compresses. Applies to `createServer()` (dev, start, the
   * compiled binary), not to a bare `buildFetchHandler()`.
   */
  compression?: boolean;
  /** Called once after the server starts listening. Use to open DB connections, warm caches, etc. */
  onStart?: () => Promise<void> | void;
  /** Called before the process exits (any signal or uncaught error). Use to close DB connections, flush queues, etc. */
  onShutdown?: () => Promise<void> | void;
  /** Called for every unexpected error: loader failures, action throws, and uncaught process exceptions. Redirects and HttpErrors are intentional control flow and are NOT reported here. The request is undefined for process-level exceptions. */
  onError?: OnErrorHook;
  /**
   * Read-only observability wrappers around requests, loaders, actions and
   * route middleware (React Router 8 Instrumentation API). Usually listed in
   * `app/lifecycle.ts`; `instrument(...)` in `app/server.ts` is equivalent.
   */
  instrumentations?: Instrumentation[];
  /**
   * Milliseconds a streamed document waits for pending `defer()` data (and
   * Suspense boundaries) before giving up: pending values reject with a 504
   * `HttpError` that `<Await>`'s error path renders. React Router's
   * `streamTimeout`. Unset → no limit.
   */
  streamTimeout?: number;
  /**
   * Run route middleware for `"use server"` actions (`/_action`, `/_stream`).
   * An action defined under `routes/` runs root → layouts → its own module's
   * `middleware`, the chain guarding a page at the same place; one defined
   * elsewhere (`app/*.server.ts`) runs root's. Default `true`. `false` restores
   * the pre-0.8 behavior (global middleware only); it goes away in 0.9.
   */
  actionMiddleware?: boolean;
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

let unregisterConfigInstrumentations: (() => void) | null = null;
let unregisterIsr: (() => void) | null = null;

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
  const m = (await f.json()) as {
    clientEntry?: string;
    rootChunk?: string;
    entryCss?: string[];
    rootCss?: string[];
    routes?: Record<string, { chunk?: string; css?: string[]; layouts?: string[] }>;
  };
  return {
    clientEntry: m.clientEntry ?? DEFAULT_MANIFEST.clientEntry,
    rootChunk: m.rootChunk,
    entryCss: m.entryCss,
    rootCss: m.rootCss,
    routes: Object.fromEntries(
      Object.entries(m.routes ?? {}).map(([pat, e]) => [
        pat,
        { file: e.chunk ?? "", chunk: e.chunk, css: e.css, layouts: e.layouts },
      ]),
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

  const manifestReady: Promise<ServerManifest> =
    !isDevRuntime() && !config.manifest
      ? loadManifest(buildDir).then((m) => ({
          clientEntry: m.clientEntry,
          rootChunk: m.rootChunk,
          entryCss: m.entryCss,
          rootCss: m.rootCss,
          routes: Object.fromEntries(
            Object.entries(m.routes).map(([pat, e]) => [
              pat,
              { file: e.chunk, chunk: e.chunk, css: e.css, layouts: e.layouts },
            ]),
          ),
        }))
      : Promise.resolve(config.manifest ?? DEFAULT_MANIFEST);

  // When routes are imported from SOURCE at runtime (dev server AND
  // `bractjs start`, which fall back to scanRoutes + dynamic import rather than
  // a pre-stubbed compiled bundle), a `"use client"` route component would
  // execute during SSR and crash on browser-only hooks. Install the runtime
  // stub that null-renders such modules on the server — parity with the
  // compiled bundle's useClientStubPlugin. Skipped on the compiled path, which
  // supplies a pre-built moduleRegistry. Same for CSS Modules: the runtime
  // plugin gives SSR the bundler's class-name map (css-modules-runtime.ts).
  if (!config.moduleRegistry) {
    installUseClientServerStub(appDir);
    installCssModulesRuntime();
  }

  // Codegen / compiled-binary path: when the caller supplies pre-scanned
  // routes, skip the runtime `Bun.Glob` scan that `bun build --compile`
  // can't satisfy (the routes/ directory isn't on the filesystem in a
  // single-binary deployment). Same idea for server actions.
  const routeFilesReady = config.routeFiles ? Promise.resolve(config.routeFiles) : scanRoutes(appDir);
  const trieReady = routeFilesReady.then(buildTrie);
  // What sitemap() lists: this app's routes, prerendered paths and locales.
  registerSiteSource({ routes: routeFilesReady, prerender: config.prerender, i18n: config.i18n });
  const actionsReady = config.actionModules
    ? loadServerActionsFromRegistry(config.actionModules)
    : loadServerActions(appDir);
  const moduleRegistry = config.moduleRegistry;
  // Route middleware for "use server" actions: chain derived from each
  // action's defining module (server/action-middleware.ts).
  const actionGate = { appDir, moduleRegistry, routeMiddleware: config.actionMiddleware !== false };
  const onError = config.onError;
  // Config-supplied instrumentations replace the previous handler's (a second
  // buildFetchHandler — tests, embedders — must not stack duplicates).
  unregisterConfigInstrumentations?.();
  unregisterConfigInstrumentations = config.instrumentations?.length
    ? instrument(...config.instrumentations)
    : null;
  const ssrEnabled = config.ssr !== false;
  const allowedHosts = config.allowedHosts ?? [];

  // SPA shell: production prefers the file `bractjs build` wrote; dev (or a
  // missing file) renders it on demand so root.tsx edits show up. Cached per
  // manifest in prod-without-file; never cached in dev.
  let spaShellCache: { key: string; html: string } | null = null;
  async function getSpaShell(manifest: ServerManifest): Promise<string> {
    if (!isDevRuntime()) {
      const shellPath = join(buildDir, "client", "__spa.html");
      const embedded = embeddedFile(join(buildDir, "client"), "__spa.html");
      if (embedded) return embedded.text();
      if (await fileExists(shellPath)) return readText(shellPath);
      const key = manifest.clientEntry;
      if (spaShellCache?.key === key) return spaShellCache.html;
      const html = await renderSpaShell(appDir, manifest, moduleRegistry);
      spaShellCache = { key, html };
      return html;
    }
    return renderSpaShell(appDir, manifest, moduleRegistry);
  }

  /** Prerendered file for a clean (query-free, dot-free) document path — embedded in a binary, or on disk — or null. */
  async function prerenderFile(relHtmlOrJson: string): Promise<Blob | null> {
    if (relHtmlOrJson.split("/").some((s) => s === ".." || s === ".")) return null;
    const path = join(buildDir, "client", "_prerender", relHtmlOrJson);
    const embedded = embeddedFile(join(buildDir, "client"), `_prerender/${relHtmlOrJson}`);
    if (embedded) return embedded;
    const file = await fileBody(path);
    return file ? new Blob([await new Response(file.body).arrayBuffer()], { type: file.type }) : null;
  }

  // The full per-request dispatch: special endpoints (API, actions, stream,
  // image, static, prerender) first, then the SSR route handler. Runs INSIDE
  // the global middleware pipeline (see the returned `fetch` below), so
  // `pipeline.use(cors()/csp()/auth/…)` governs every response — not just SSR
  // documents. `context` is the shared mutable object threaded through the
  // pipeline; route-level middleware and getCspNonce() read the same object.
  async function dispatch(request: Request, context: Record<string, unknown>): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Dev-only: on-demand module compilation for HMR module swap.
    // SECURITY(high): use isExplicitDev() (NODE_ENV === "development") rather
    // than isDev() (NODE_ENV !== "production"). An operator who forgets to set
    // NODE_ENV would otherwise expose /_hmr/module in production, letting
    // anyone compile and download arbitrary appDir .ts/.tsx files as JS.
    // Also require the dev RUNTIME: `NODE_ENV=development bractjs start` must
    // not turn these on for a production server.
    if (isDevRuntime() && isExplicitDev() && pathname === "/_hmr/module") {
      const { handleHmrModuleRequest } = await import("../dev/hmr-module-handler.ts");
      return handleHmrModuleRequest(url, appDir);
    }

    // Dev-only: the error overlay's code frames and open-in-editor. The
    // handlers also require the same-origin mutation gate (see the module).
    if (
      isDevRuntime() &&
      isExplicitDev() &&
      (pathname === "/_bractjs/stack" || pathname === "/_bractjs/open")
    ) {
      const overlay = await import("../dev/overlay-endpoints.ts");
      const opts = { root: process.cwd(), clientOutDir: resolve(buildDir, "client") };
      return pathname === "/_bractjs/stack"
        ? overlay.handleStackRequest(request, opts)
        : overlay.handleOpenRequest(request, opts);
    }

    // Dev-only: serve the DevTools panel module imported by hmr-client.
    // SECURITY(high): gated by isExplicitDev() so production never compiles
    // and ships package internals as JS.
    if (isDevRuntime() && isExplicitDev() && pathname === "/_bractjs/devtools.js") {
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

    // WebSocket handshakes for websocket() endpoints (Bun / Deno adapters).
    if (request.headers.has("Upgrade")) {
      const { handleWebSocketRequest } = await import("./websocket.ts");
      const wsRes = await handleWebSocketRequest(request);
      if (wsRes) return wsRes;
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
      const actionRes = await handleActionRequest(request, actionGate);
      if (actionRes) return actionRes;
    }

    // SSE streaming endpoint for async-generator server actions.
    if (pathname === "/_stream") {
      await actionsReady;
      const { handleStreamRequest } = await import("./stream-handler.ts");
      const streamRes = await handleStreamRequest(request, actionGate);
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
    if (!isDevRuntime() && isDocGet && request.headers.get(ISR_REGEN_HEADER) !== isrToken) {
      if (pathname === "/_data") {
        const target = url.searchParams.get("path") ?? "/";
        const [targetPathname, targetSearch] = target.split("?");
        if (!targetSearch) {
          const fromIsr = await isr.serve(targetPathname, "data");
          if (fromIsr) return fromIsr;
          const rel = targetPathname === "/" ? "_data.json" : targetPathname.slice(1) + "/_data.json";
          const f = await prerenderFile(rel);
          if (f) {
            return new Response(f, {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=0, must-revalidate",
              },
            });
          }
        }
      } else if (!url.search) {
        const fromIsr = await isr.serve(pathname, "html");
        if (fromIsr) return fromIsr;
        const rel = pathname === "/" ? "index.html" : pathname.slice(1) + "/index.html";
        const f = await prerenderFile(rel);
        if (f) {
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
    const handlerConfig: HandlerConfig = {
      appDir,
      publicDir,
      manifest,
      onError,
      moduleRegistry,
      streamTimeout: config.streamTimeout,
      i18n: config.i18n,
    };
    return handleRequest(request, trie, handlerConfig, context);
  }

  // ISR (route `config.revalidate`): prerendered pages regenerate in the
  // background through this same handler, with a secret header that skips the
  // prerender cache (server/isr.ts).
  const isrToken = crypto.randomUUID();
  const isr = createIsr({
    load: async (rel) => (await prerenderFile(rel))?.text() ?? null,
    render: async (path) => {
      const headers = { [ISR_REGEN_HEADER]: isrToken };
      const [html, data] = await Promise.all([
        handler(new Request(`http://isr.local${path}`, { headers })),
        handler(new Request(`http://isr.local/_data?path=${encodeURIComponent(path)}`, { headers })),
      ]);
      return { html, data };
    },
  });
  unregisterIsr?.();
  unregisterIsr = registerIsr(isr);

  const handler = async function fetch(request: Request): Promise<Response> {
    // DNS-rebinding guard for the dev server (see dev-host.ts). Runs before
    // everything, global middleware included. Production is unaffected.
    if (isDevRuntime() && !isAllowedDevHost(request.headers.get("Host"), allowedHosts)) {
      return new Response(
        `Blocked request: Host "${request.headers.get("Host")}" is not allowed by the dev server. ` +
          "Add it to `allowedHosts` in bractjs.config.ts.",
        { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    // Run the global middleware pipeline around the ENTIRE dispatch so
    // cors()/csp()/logging/auth attached via `pipeline.use(...)` apply to
    // API routes, server actions, /_stream, /_image and static assets — not
    // only SSR documents. The per-route (nested) middleware chain still runs
    // inside handleRequest for SSR/_data, sharing this same `context` object.
    const ctx: MiddlewareContext = createMiddlewareContext(request);
    // SECURITY(high): adapter-agnostic catch-all. An uncaught throw from a
    // global middleware or from dispatch itself (e.g. resolveRouteChain at
    // import time) would otherwise reach the adapter's error handler — which on
    // Bun leaks err.message and on Cloudflare/custom adapters isn't handled at
    // all. Log, fire onError (so observability still sees it), and return a
    // generic 500 with the message gated to dev — matching every other path.
    try {
      // getRequest() works anywhere below this point (server actions above all).
      const res = await runWithRequest(request, () =>
        instrumentRequest({ request, context: ctx.context }, () =>
          pipeline.run(ctx, () => dispatch(request, ctx.context)),
        ),
      );
      // After global middleware, so a cookie it sets is covered too.
      return privateWhenSettingCookies(res, request);
    } catch (err) {
      console.error("[bract] unhandled request error:", err);
      await fireOnError(onError, err, request);
      return error(
        isExplicitDev() ? (err instanceof Error ? err.message : String(err)) : "Internal Server Error",
        500,
      );
    }
  };
  return handler;
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
    console.warn(
      `[bract] No build found at ${buildDir}/route-manifest.json. Run \`bractjs build\` before \`bractjs start\`.`,
    );
    return;
  }
  try {
    const m = (await f.json()) as { mode?: string };
    if (m.mode !== "production") {
      console.warn(
        `[bract] Build at ${buildDir} was not produced by \`bractjs build\` (mode=${m.mode ?? "unset"}). Re-run \`bractjs build\` for a production-ready manifest.`,
      );
    }
  } catch {
    // Malformed manifest — the request path will surface the real error.
  }
}

// Module-level registry of live servers. Signal handlers are registered
// exactly once per process and iterate this set, so multiple createServer()
// calls (tests, multi-port setups, HMR restarts) each keep their own
// onShutdown/onError hooks — previously the last server's hooks clobbered
// everyone's, and the signal path could only stop the first adapter.
interface ActiveServerRecord {
  onShutdown?: () => Promise<void> | void;
  onError?: OnErrorHook;
  stopAdapter: () => void;
  stopped: boolean;
}
const activeServers = new Set<ActiveServerRecord>();
let signalsRegistered = false;
let processShutdownStarted = false;

async function shutdownServer(rec: ActiveServerRecord): Promise<void> {
  if (rec.stopped) return;
  rec.stopped = true;
  activeServers.delete(rec);
  try {
    const result = rec.onShutdown?.();
    if (result instanceof Promise) {
      try {
        await result;
      } catch (err) {
        console.error("[bract] onShutdown error:", err);
      }
    }
  } catch (err) {
    console.error("[bract] onShutdown error:", err);
  } finally {
    rec.stopAdapter();
  }
}

async function shutdownAll(signal?: string): Promise<void> {
  if (processShutdownStarted) return;
  processShutdownStarted = true;
  if (signal) console.log(`\n[bract] Received ${signal}, shutting down…`);
  await Promise.all([...activeServers].map((rec) => shutdownServer(rec)));
}

// `bractjs dev` / `bractjs start` import `<appDir>/server.ts` purely for its
// side effects (pipeline.use(...) registrations). That file also calls
// createServer() at module scope — the compile entrypoint contract — which
// must NOT bind a second server during such an import. loadServerEntry()
// (src/config/server-entry.ts) sets this flag around the import.
let createServerSuppressed = false;
export function setCreateServerSuppressed(v: boolean): void {
  createServerSuppressed = v;
}

// The config of the last suppressed createServer() call, for appFetchHandler().
let suppressedConfig: Partial<BractJSConfig> | null = null;

export function createServer(config?: Partial<BractJSConfig>): {
  stop(): void;
} {
  if (createServerSuppressed) {
    suppressedConfig = config ?? {};
    return { stop() {} };
  }

  // An explicit `port` wins; otherwise the platform's PORT, then 3000.
  const port = parsePort(config?.port, "the `port` option") ?? envPort() ?? 3000;

  // A compiled binary carries its manifest (and usually its client build), so
  // there's no build/ directory to check.
  if (!isDevRuntime() && !config?.manifest) {
    void warnIfStaleBuild(resolve(config?.buildDir ?? "./build"));
  }

  const appHandler = buildFetchHandler(config ?? {});
  const fetchHandler = config?.compression === false ? appHandler : withCompression(appHandler);

  // The provided adapter, else the one for the runtime this is running on:
  // Bun, Deno, or Node.js (a `bractjs build --target node` server).
  const adapter = config?.adapter ?? defaultAdapter(config);

  if (adapter instanceof BunAdapter) {
    adapter.setHandler(fetchHandler);
    adapter.listen(port);
  } else {
    // Custom adapter: wire fetch handler in and call listen if available.
    if (
      "setHandler" in adapter &&
      typeof (adapter as unknown as { setHandler: unknown }).setHandler === "function"
    ) {
      (adapter as unknown as { setHandler: (h: (r: Request) => Promise<Response>) => void }).setHandler(
        fetchHandler,
      );
    }
    adapter.listen?.(port);
  }

  const rec: ActiveServerRecord = {
    onShutdown: config?.onShutdown,
    onError: config?.onError,
    stopAdapter: () => {
      if (adapter instanceof BunAdapter) {
        adapter.stop();
      } else if ("stop" in adapter && typeof (adapter as unknown as { stop: unknown }).stop === "function") {
        (adapter as unknown as { stop: () => void }).stop();
      }
    },
    stopped: false,
  };
  activeServers.add(rec);

  const shownHost = !config?.hostname || config.hostname === "127.0.0.1" ? "localhost" : config.hostname;
  console.log(`[bract] Server running at http://${shownHost}:${port}`);

  const gracefulShutdown = (signal?: string, exitCode = 0): void => {
    void shutdownAll(signal).finally(() => process.exit(exitCode));
  };

  if (!signalsRegistered) {
    signalsRegistered = true;
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
    // `beforeExit` fires when the event loop is naturally draining — we
    // already shut down the adapters at that point, but we must NOT call
    // process.exit(). Doing so re-enters the lifecycle and prevents test
    // runners (and any parent process supervising us) from observing a
    // clean exit code. Just run the user hooks + stop the listeners.
    process.on("beforeExit", () => {
      void shutdownAll();
    });
    process.on("uncaughtException", (err) => {
      console.error("[bract] Uncaught exception:", err);
      void Promise.all([...activeServers].map((s) => fireOnError(s.onError, err))).then(() =>
        gracefulShutdown("uncaughtException", 1),
      );
    });
    // Unhandled rejections are routed to onError and logged, but do NOT bring
    // the process down: a stray fire-and-forget promise (cache write, prefetch)
    // must not kill a serving production process. Genuinely fatal states still
    // arrive via uncaughtException above.
    process.on("unhandledRejection", (reason) => {
      console.error("[bract] Unhandled promise rejection:", reason);
      for (const s of activeServers) void fireOnError(s.onError, reason);
    });
  }

  void Promise.resolve(config?.onStart?.()).catch((err) => {
    console.error("[bract] onStart error:", err);
  });

  return {
    // Programmatic stop — runs THIS server's `onShutdown`, then closes its
    // listener. Does NOT call `process.exit()`. Tests rely on this so the
    // runner can print its summary; long-running supervisors rely on it so a
    // stop() doesn't tear down the whole worker. Use SIGTERM/SIGINT if you
    // actually want the process to exit.
    stop() {
      void shutdownServer(rec);
    },
  };
}

// Allow running directly: bun run src/server/serve.ts
if (import.meta.main) {
  createServer();
}

function defaultAdapter(config: Partial<BractJSConfig> | undefined): BractAdapter {
  const g = globalThis as { Bun?: unknown; Deno?: unknown };
  if (g.Bun) return new BunAdapter(config?.maxRequestBodySize, config?.hostname);
  if (g.Deno)
    return new DenoAdapter({ hostname: config?.hostname, maxRequestBodySize: config?.maxRequestBodySize });
  return new NodeAdapter({ hostname: config?.hostname, maxRequestBodySize: config?.maxRequestBodySize });
}

/**
 * The app's request handler, for serverless platforms (Vercel, Netlify, AWS
 * Lambda, Deno Deploy): imports your server entry — usually `app/server.ts` —
 * with its `createServer({...})` call kept from listening, and returns the
 * `fetch(request)` handler that call configured (middleware, config,
 * generated registries, compression). `bractjs build --target node` writes
 * `build/node/handler.js` with it:
 *
 *   export const fetch = await appFetchHandler(() => import("../server.ts"));
 */
export async function appFetchHandler(
  importServerEntry: () => Promise<unknown>,
): Promise<(request: Request) => Promise<Response>> {
  suppressedConfig = null;
  setCreateServerSuppressed(true);
  try {
    await importServerEntry();
  } finally {
    setCreateServerSuppressed(false);
  }
  const config = suppressedConfig as Partial<BractJSConfig> | null;
  if (!config) {
    throw new Error("[bractjs] appFetchHandler(): the server entry didn't call createServer({...})");
  }
  const app = buildFetchHandler(config);
  return config.compression === false ? app : withCompression(app);
}
