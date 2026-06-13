import { createServer } from "../server/serve.ts";
import { setRuntimeMode, setDevHmrPort } from "../server/env.ts";
import { createHmrServer } from "./hmr-server.ts";
import { watchApp } from "./watcher.ts";
import { rebuildClient } from "./rebuilder.ts";
import { filePathToPattern, scanRoutes } from "../server/scanner.ts";
import { basename, extname, join, resolve } from "node:path";
import type { LifecycleHooks } from "../server/lifecycle.ts";
import { loadUserConfig } from "../config/load.ts";
import type { BractJSConfig } from "../server/serve.ts";
import { writeRouteTypes, explainStalenessForApp } from "../codegen/route-codegen.ts";
import { lintRouteModuleSource } from "../build/route-lint.ts";
import { formatRouteTable, type RouteTableRow } from "./route-table.ts";

// Warn-once across HMR rebuilds so the same lint message doesn't spam the log.
const warnedRouteIssues = new Set<string>();

/**
 * Statically lint route modules and print the route table. Reads each route
 * file's source once (no module execution, no per-request cost). Returns the
 * table rows so the boot path can print them alongside the HMR port.
 */
async function inspectRoutes(appDir: string): Promise<RouteTableRow[]> {
  const routes = await scanRoutes(appDir);
  const rows: RouteTableRow[] = [];
  for (const r of routes) {
    let src = "";
    try {
      src = await Bun.file(resolve(process.cwd(), appDir, r.filePath)).text();
    } catch {
      continue;
    }
    for (const warning of lintRouteModuleSource(src, r.filePath)) {
      const key = r.filePath + "\0" + warning;
      if (warnedRouteIssues.has(key)) continue;
      warnedRouteIssues.add(key);
      console.warn(`[bractjs] ${warning}`);
    }
    rows.push({
      pattern: r.urlPattern === "" ? "/" : "/" + r.urlPattern,
      file: r.filePath,
      hasLoader: /^export\s+(?:async\s+)?function\s+loader\b|^export\s+const\s+loader\b/m.test(src),
      hasAction: /^export\s+(?:async\s+)?function\s+action\b|^export\s+const\s+action\b/m.test(src),
    });
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

export interface DevServerOptions {
  /** HTTP port for the app server. Default: config.port ?? 3000. */
  port?: number;
  /** WebSocket port for HMR. Default: 3001. */
  hmrPort?: number;
  /** Merged over values from bractjs.config.ts. */
  config?: Partial<BractJSConfig>;
  /**
   * Skip loading bractjs.config.ts from cwd.
   * Useful when the caller supplies the full config via the `config` option.
   */
  skipUserConfig?: boolean;
}

export interface DevServer {
  stop(): void;
}

export async function createDevServer(options?: DevServerOptions): Promise<DevServer> {
  // Must precede any user-code import so SSR-time isDevRuntime() checks
  // (e.g. inside <LiveReload>) observe the dev mode.
  setRuntimeMode("dev");

  const userConfig = options?.skipUserConfig ? {} : await loadUserConfig();
  const merged: Partial<BractJSConfig> = { ...userConfig, ...options?.config };
  // Note: the `"use client"` SSR stub is installed by buildFetchHandler (it runs
  // for any source-import path, dev or `bractjs start`), so no separate dev hook
  // is needed here.

  const hmrPort = options?.hmrPort ?? merged.hmrPort ?? 3001;
  const appPort = options?.port ?? merged.port ?? 3000;
  // Publish the port so the SSR dev bootstrap tells the HMR client where to connect.
  setDevHmrPort(hmrPort);

  const appDir = merged.appDir ?? "./app";

  // Keep typed routes fresh on boot (covers "added a route while the server was
  // down"). Idempotent — no-op write when nothing changed.
  await syncRouteTypes(appDir);

  // Friendly port-conflict message instead of a raw Bun EADDRINUSE stack.
  const onPortInUse = (which: "app server" | "HMR socket", port: number): never => {
    console.error(
      `[bractjs] Port ${port} is already in use (${which}). ` +
        `Set \`port\` (and \`hmrPort\` for the HMR socket) in bractjs.config.ts, ` +
        `or stop the process using it.`,
    );
    return process.exit(1);
  };

  let hmr: ReturnType<typeof createHmrServer>;
  try {
    hmr = createHmrServer(hmrPort);
  } catch (err) {
    if ((err as { code?: string }).code === "EADDRINUSE") onPortInUse("HMR socket", hmrPort);
    throw err;
  }

  // Build client bundle before the HTTP server starts accepting requests
  const { duration: initialMs } = await rebuildClient(merged);
  console.log(`[bractjs] initial client build in ${initialMs}ms`);

  // Lint route modules + collect the route table (read sources once, no exec).
  const routeRows = await inspectRoutes(appDir);

  // Load user lifecycle hooks if defined (e.g. app/lifecycle.ts)
  let lifecycle: LifecycleHooks = {};
  try {
    const lifecyclePath = `${process.cwd()}/app/lifecycle.ts`;
    const mod = await import(lifecyclePath);
    if (mod.default) lifecycle = mod.default;
  } catch {
    // No lifecycle file — that's fine
  }

  let srv: ReturnType<typeof createServer>;
  try {
    srv = createServer({ port: appPort, ...merged, ...lifecycle });
  } catch (err) {
    hmr.stop();
    if ((err as { code?: string }).code === "EADDRINUSE") onPortInUse("app server", appPort);
    throw err;
  }

  watchApp(appDir, async (file, info) => {
    // Add/remove/rename of a route file changes the route set → regenerate
    // typed routes. Saves (content changes) never alter the generated output
    // (it uses type-only `typeof import(...)`), so skip codegen on those.
    if (info.renameSeen && file.startsWith("routes/")) {
      await syncRouteTypes(appDir);
    }

    // Re-lint changed route modules (warn-once dedupes repeats).
    if (file.startsWith("routes/")) await inspectRoutes(appDir);

    const { duration } = await rebuildClient(merged);

    // Route files (not layout): do a fine-grained module swap without full reload.
    // Root, layouts, and other files: fall back to full page reload.
    const isRoute =
      file.startsWith("routes/") &&
      !file.endsWith("layout.tsx") &&
      !file.endsWith("layout.ts");

    if (isRoute) {
      const pattern = filePathToPattern(file);
      // Chunk URL = same basename as route file; splitting build puts it in build/client/
      const chunkUrl = `/build/client/${basename(file, extname(file))}.js`;
      hmr.broadcast({ type: "hmr:route", pattern, chunkUrl, file, duration });
      console.log(`✓ ${file} → module swap (pattern="${pattern}") in ${duration}ms`);
    } else {
      hmr.broadcast({ type: "hmr:reload", file, duration });
      console.log(`✓ ${file} → full reload in ${duration}ms`);
    }
  });

  console.log(formatRouteTable(routeRows));
  console.log(`BractJS dev server on http://localhost:${appPort} (HMR ws://localhost:${hmrPort})`);

  return {
    stop() {
      srv.stop();
      hmr.stop();
    },
  };
}

// Preserve direct-run behavior: bun run src/dev/server.ts
if (import.meta.main) {
  await createDevServer();
}
