import { join, resolve } from "node:path";
import { extractApiRouteDefs } from "../build/route-lint.ts";
import { compileMdxRoutes } from "../codegen/mdx.ts";
import { explainStalenessForApp, writeRouteTypes } from "../codegen/route-codegen.ts";
import { loadUserConfig } from "../config/load.ts";
import { loadEnvModule, loadLifecycleModule, loadServerEntry } from "../config/server-entry.ts";
import { clearActionRegistry, loadServerActions } from "../server/action-registry.ts";
import { cssModuleClassesChanged, installCssModulesRuntime } from "../server/css-modules-runtime.ts";
import { listApiRoutes } from "../server/api-route.ts";
import { bumpDevModuleGeneration, envPort, parsePort, setDevHmrPort, setRuntimeMode } from "../server/env.ts";
import type { LifecycleHooks } from "../server/lifecycle.ts";
import { filePathToPattern } from "../server/scanner.ts";
import type { BractJSConfig } from "../server/serve.ts";
import { createServer } from "../server/serve.ts";
import { installUseClientServerStub } from "../server/use-client-runtime.ts";
import { createHmrServer } from "./hmr-server.ts";
import { rebuildClient, serializeRebuilds } from "./rebuilder.ts";
import { collectRouteRows, formatRouteTable, type RouteTableRow } from "./route-table.ts";
import { watchApp } from "./watcher.ts";

// Warn-once across HMR rebuilds so the same lint message doesn't spam the log.
const warnedRouteIssues = new Set<string>();

/**
 * Statically lint route modules and print the route table. Reads each route
 * file's source once (no module execution, no per-request cost). Returns the
 * table rows so the boot path can print them alongside the HMR port.
 */
async function inspectRoutes(appDir: string): Promise<RouteTableRow[]> {
  const { rows, warnings } = await collectRouteRows(appDir);
  for (const warning of warnings) {
    if (warnedRouteIssues.has(warning)) continue;
    warnedRouteIssues.add(warning);
    console.warn(`[bractjs] ${warning}`);
  }
  return rows;
}

/**
 * Regenerate typed routes if the route set drifted from the last codegen.
 * Idempotent: writeRouteTypes skips the write when content is unchanged, so it
 * never triggers an editor reload loop. Runs at boot and on add/remove/rename.
 */
async function syncRouteTypes(appDir: string): Promise<void> {
  try {
    const reason = await explainStalenessForApp(appDir);
    if (reason) console.log(`[bractjs] ${reason}`);
    await writeRouteTypes(appDir);
  } catch (err) {
    // Codegen is a DX aid, never fatal to the dev loop.
    console.warn("[bractjs] route codegen skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Warn about typed API routes that are defined but not live. Registration is
 * an import side effect — a `route()` call in a module nothing imports
 * silently doesn't exist, historically the framework's worst failure mode.
 * server.ts was imported at boot; root.tsx is imported here (SSR would do it
 * on the first request anyway), then the statically-scanned definitions are
 * diffed against the live registry.
 */
async function warnUnregisteredApiRoutes(appDir: string): Promise<void> {
  for (const root of ["root.tsx", "root.ts"]) {
    try {
      const rootPath = resolve(process.cwd(), appDir, root);
      if (await Bun.file(rootPath).exists()) {
        await import(rootPath);
        break;
      }
    } catch {
      // A broken root module surfaces properly on the first SSR render.
    }
  }

  const defined: Array<{ file: string; method: string; path: string }> = [];
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  for await (const rel of glob.scan(appDir)) {
    if (rel.startsWith("_generated/")) continue;
    let src: string;
    try {
      src = await Bun.file(join(appDir, rel)).text();
    } catch {
      continue;
    }
    for (const def of extractApiRouteDefs(src)) defined.push({ file: rel, ...def });
  }
  if (defined.length === 0) return;

  const registered = new Set(listApiRoutes().map((r) => `${r.method} ${r.path}`));
  for (const d of defined) {
    if (registered.has(`${d.method} ${d.path}`)) continue;
    console.warn(
      `[bractjs] ${d.file} defines route("${d.method}", "${d.path}") but the endpoint is NOT live — ` +
        `typed API routes register when their defining module is imported, and nothing imports this one. ` +
        `Import it from app/root.tsx or app/server.ts.`,
    );
  }
}

export interface DevServerOptions {
  /** HTTP port for the app server. Default: config.port ?? 3000. */
  port?: number;
  /** WebSocket port for HMR. Default: 3001. */
  hmrPort?: number;
  /**
   * Interface for the app + HMR servers. Default: config.hostname ??
   * "127.0.0.1" (loopback only). Pass "0.0.0.0" to reach the dev server from
   * other devices — `bractjs dev --host` does this.
   */
  hostname?: string;
  /** Merged over values from bractjs.config.ts. */
  config?: Partial<BractJSConfig>;
  /**
   * Skip loading bractjs.config.ts from cwd.
   * Useful when the caller supplies the full config via the `config` option.
   */
  skipUserConfig?: boolean;
  /**
   * Called when a change lands that the running process cannot absorb —
   * `app/server.ts`, `lifecycle.ts`, any `*.server.ts`, a shared non-route
   * module, or an added/removed route file. `bractjs dev` passes a callback
   * that exits with a reserved code so its supervisor respawns the server;
   * the default (programmatic use) logs a prominent restart warning and the
   * dev loop continues with the previous server-side code.
   */
  onRestartRequired?: (file: string) => void;
}

export interface DevServer {
  stop(): void;
}

/**
 * A dev-server startup failure with a user-actionable message (e.g. a port
 * conflict). The CLI prints `message` without a stack and exits non-zero;
 * programmatic callers can catch it and react — createDevServer never calls
 * `process.exit()` itself.
 */
export class DevServerError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DevServerError";
  }
}

export async function createDevServer(options?: DevServerOptions): Promise<DevServer> {
  // Must precede any user-code import so SSR-time isDevRuntime() checks
  // (e.g. inside <LiveReload>) observe the dev mode.
  setRuntimeMode("dev");

  const userConfig = options?.skipUserConfig ? {} : await loadUserConfig();
  const merged: Partial<BractJSConfig> = { ...userConfig, ...options?.config };
  // Runtime plugins for source-imported app code ("use client" stubs, CSS
  // Module class maps) only apply to modules loaded after registration, and
  // boot imports app modules (route lint, server.ts, lifecycle.ts) before
  // createServer() runs — so register them first.
  installUseClientServerStub(merged.appDir ?? "./app");
  installCssModulesRuntime();

  const hmrPort = options?.hmrPort ?? merged.hmrPort ?? 3001;
  // Flag/option > PORT env > config > 3000.
  const appPort =
    parsePort(options?.port, "the `port` option") ??
    envPort() ??
    parsePort(merged.port, "bractjs.config.ts") ??
    3000;
  // SECURITY(medium): loopback by default. The dev server exposes source-
  // derived endpoints (/_hmr/module, dev error messages) that must not be
  // reachable from the local network unless the developer opts in.
  const hostname = options?.hostname ?? merged.hostname ?? "127.0.0.1";
  // Publish the port so the SSR dev bootstrap tells the HMR client where to connect.
  setDevHmrPort(hmrPort);

  const appDir = merged.appDir ?? "./app";

  // Keep typed routes fresh on boot (covers "added a route while the server was
  // down"). Idempotent — no-op write when nothing changed.
  await syncRouteTypes(appDir);

  // Friendly port-conflict error instead of a raw Bun EADDRINUSE stack. Thrown
  // (not process.exit) so programmatic createDevServer() callers keep running;
  // the CLI catches DevServerError and exits with the message.
  const onPortInUse = (which: "app server" | "HMR socket", port: number): never => {
    throw new DevServerError(
      `Port ${port} is already in use (${which}). ` +
        `Set \`port\` (and \`hmrPort\` for the HMR socket) in bractjs.config.ts, ` +
        `or stop the process using it.`,
      "EADDRINUSE",
    );
  };

  let hmr: ReturnType<typeof createHmrServer>;
  try {
    hmr = createHmrServer(hmrPort, hostname);
  } catch (err) {
    if ((err as { code?: string }).code === "EADDRINUSE") onPortInUse("HMR socket", hmrPort);
    throw err;
  }

  // Build client bundle before the HTTP server starts accepting requests
  const { duration: initialMs } = await rebuildClient(merged);
  console.log(`[bractjs] initial client build in ${initialMs}ms`);

  // Lint route modules + collect the route table (read sources once, no exec).
  const routeRows = await inspectRoutes(appDir);

  // Route files known at boot. The watcher uses this to tell a TRUE route
  // add/remove from an atomic-save rename: editors (vim, sed -i) replace files
  // via rename, which fs.watch reports identically to a create/delete. A true
  // add/remove restarts the process, so the set can't go stale while it
  // matters; the no-supervisor fallback re-syncs it in the watcher.
  const knownRouteFiles = new Set(routeRows.map((r) => r.file));

  // app/env.ts first: invalid environment variables stop the dev server with
  // the full list instead of surfacing later as a failed import.
  try {
    await loadEnvModule(appDir);
  } catch (err) {
    hmr.stop();
    throw new DevServerError(err instanceof Error ? err.message : String(err));
  }

  // Load user lifecycle hooks if defined (<appDir>/lifecycle.ts)
  const lifecycle: LifecycleHooks = await loadLifecycleModule(appDir);

  // Import <appDir>/server.ts for its pipeline.use(...) side effects (its own
  // createServer() call is suppressed) so global middleware behaves the same
  // in dev as under `bractjs start` and the compiled binary. Loaded once at
  // boot — editing server.ts requires a restart, like all server modules.
  const entry = await loadServerEntry(appDir);
  if (entry.error) {
    console.warn(
      "[bractjs] app/server.ts failed to load — global middleware registered there is INACTIVE in dev:",
      entry.error instanceof Error ? entry.error.message : entry.error,
    );
  }

  let srv: ReturnType<typeof createServer>;
  try {
    srv = createServer({ ...merged, port: appPort, hostname, ...lifecycle });
  } catch (err) {
    hmr.stop();
    if ((err as { code?: string }).code === "EADDRINUSE") onPortInUse("app server", appPort);
    throw err;
  }

  // After createServer so the "use client" SSR stub is installed before the
  // root.tsx import this performs. Never fatal — it only prints warnings.
  try {
    await warnUnregisteredApiRoutes(appDir);
  } catch (err) {
    console.warn("[bractjs] API-route registration check skipped:", err instanceof Error ? err.message : err);
  }

  const requestRestart =
    options?.onRestartRequired ??
    ((file: string) => {
      console.warn(
        `[bractjs] ${file} is a server-side change this process cannot absorb — ` +
          `restart the dev server to apply it (\`bractjs dev\` does this automatically).`,
      );
    });

  // One change batch per watcher burst. Batches never run concurrently: one
  // arriving mid-rebuild is merged with any other waiting batch and handled
  // once the current rebuild finishes (see serializeRebuilds).
  type ChangeBatch = { files: string[]; renameSeen: boolean };
  const handleChange = async ({ files: rawFiles, renameSeen }: ChangeBatch): Promise<void> => {
    // fs.watch yields backslash-separated paths on Windows; the checks and
    // pattern derivation below assume POSIX form (action-registry and the
    // codegen normalize the same way). Our own codegen writes to _generated/
    // (type-only output) — reacting would loop.
    const all = [...new Set(rawFiles.map((f) => f.split("\\").join("/")))].filter(
      (f) => !f.startsWith("_generated/"),
    );

    // An MDX route: recompile it to its .mdx.tsx sibling. That write is a
    // route-module change the code below handles like any other (a live
    // edit, or a restart when the route set changed).
    if (all.some((f) => f.endsWith(".mdx"))) {
      try {
        await compileMdxRoutes(appDir);
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
    const files = all.filter((f) => !f.endsWith(".mdx"));
    if (files.length === 0) return;

    // ── Changes the running process cannot absorb ─────────────────────────
    // Route-module CONTENT edits are handled in-process below (cache-busted
    // re-imports). Everything else server-side is not: `*.server.ts` and
    // shared non-route modules are reached through cached unversioned import
    // specifiers inside route modules; `server.ts`/`lifecycle.ts` ran their
    // side effects at boot; and the route trie/manifest is built once, so an
    // added or removed route file would 404 / linger until restart.
    const isScript = (f: string) => f.endsWith(".ts") || f.endsWith(".tsx");
    const isRouteModule = (f: string) => f.startsWith("routes/") || f === "root.tsx" || f === "root.ts";
    const isServerEntry = (f: string) =>
      f === "server.ts" || f === "lifecycle.ts" || /\.server\.tsx?$/.test(f);

    for (const file of files) {
      // A rename under routes/ is a route-set change only when file existence
      // disagrees with the known set: added (exists, unknown) or removed
      // (missing, known). Atomic saves (exists, known) and editor temp files
      // (missing, unknown — e.g. sed's `.!1234!x.tsx`) are not set changes.
      let routeSetChanged = false;
      if (renameSeen && file.startsWith("routes/")) {
        const exists = await Bun.file(resolve(process.cwd(), appDir, file)).exists();
        routeSetChanged = exists !== knownRouteFiles.has(file);
        if (exists) knownRouteFiles.add(file);
        else knownRouteFiles.delete(file);
      }
      if (isServerEntry(file) || routeSetChanged || (isScript(file) && !isRouteModule(file))) {
        // Under `bractjs dev` this exits for the supervisor to respawn us and
        // never returns. Programmatic callers get the warning default; fall
        // through so they keep the previous best-effort in-process behavior.
        requestRestart(file);
      }
    }

    const touchesRoutes = files.some((f) => f.startsWith("routes/"));

    // Add/remove/rename of a route file changes the route set → regenerate
    // typed routes. Saves (content changes) never alter the generated output
    // (it uses type-only `typeof import(...)`), so skip codegen on those.
    if (renameSeen && touchesRoutes) {
      await syncRouteTypes(appDir);
    }

    // Route-module change: bump the dev module generation so the next request
    // re-imports fresh loader/action/beforeLoad code instead of Bun's cached
    // copy, then re-register "use server" bodies so /_action resolves the
    // fresh function refs (the registry holds references from the old import).
    if (files.some((f) => isScript(f) && (isRouteModule(f) || (renameSeen && /\.server\.tsx?$/.test(f))))) {
      bumpDevModuleGeneration();
      clearActionRegistry();
      await loadServerActions(appDir);
    }

    // Re-lint changed route modules (warn-once dedupes repeats).
    if (touchesRoutes) await inspectRoutes(appDir);

    const { duration, routeChunks } = await rebuildClient(merged);

    // A CSS Module whose class set changed: the server's imported map (and the
    // client JS's) are stale, and only a restart re-imports them. Rule edits
    // keep the names, so they fall through to the stylesheet hot-swap below.
    for (const file of files) {
      if (
        file.endsWith(".module.css") &&
        (await cssModuleClassesChanged(resolve(process.cwd(), appDir, file)))
      ) {
        requestRestart(file);
      }
    }

    const [only] = files;
    // Route files (not layout): do a fine-grained module swap without full reload.
    // Root, layouts, and other files: fall back to full page reload.
    const isRoute =
      files.length === 1 &&
      only.startsWith("routes/") &&
      !only.endsWith(".css") &&
      !only.endsWith("layout.tsx") &&
      !only.endsWith("layout.ts");
    const chunkUrl = isRoute ? routeChunks.get(filePathToPattern(only)) : undefined;

    if (files.every((f) => f.endsWith(".css"))) {
      // Styles are extracted to real files, so a CSS edit needs no JS swap and
      // no reload — the browser just re-fetches every rebuilt stylesheet.
      // Checked before `isRoute` because a .css file living under routes/
      // would otherwise be mistaken for a route module.
      hmr.broadcast({ type: "hmr:css", file: only, duration });
      console.log(`✓ ${files.join(", ")} → style update in ${duration}ms`);
    } else if (isRoute && chunkUrl) {
      const pattern = filePathToPattern(only);
      // The chunk the rebuild actually wrote for this route (its path mirrors
      // the source tree under build/client/, e.g. /build/client/app/routes/x.js).
      hmr.broadcast({ type: "hmr:route", pattern, chunkUrl, file: only, duration });
      console.log(`✓ ${only} → module swap (pattern="${pattern}") in ${duration}ms`);
    } else {
      hmr.broadcast({ type: "hmr:reload", file: only, duration });
      console.log(`✓ ${files.join(", ")} → full reload in ${duration}ms`);
    }
  };
  const scheduleChange = serializeRebuilds<ChangeBatch>(handleChange, (queued, next) => ({
    files: [...queued.files, ...next.files],
    renameSeen: queued.renameSeen || next.renameSeen,
  }));
  const watcher = watchApp(appDir, (_file, info) =>
    scheduleChange({ files: info.files, renameSeen: info.renameSeen }),
  );

  console.log(formatRouteTable(routeRows));
  console.log(`BractJS dev server on http://localhost:${appPort} (HMR ws://localhost:${hmrPort})`);

  return {
    stop() {
      watcher.close();
      srv.stop();
      hmr.stop();
    },
  };
}

// Preserve direct-run behavior: bun run src/dev/server.ts
if (import.meta.main) {
  await createDevServer();
}
