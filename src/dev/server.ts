import { createServer } from "../server/serve.ts";
import { setRuntimeMode } from "../server/env.ts";
import { createHmrServer } from "./hmr-server.ts";
import { watchApp } from "./watcher.ts";
import { rebuildClient } from "./rebuilder.ts";
import { filePathToPattern } from "../server/scanner.ts";
import { basename, extname } from "node:path";
import type { LifecycleHooks } from "../server/lifecycle.ts";
import { loadUserConfig } from "../config/load.ts";
import type { BractJSConfig } from "../server/serve.ts";

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

  const hmrPort = options?.hmrPort ?? 3001;
  const appPort = options?.port ?? merged.port ?? 3000;

  const hmr = createHmrServer(hmrPort);

  // Build client bundle before the HTTP server starts accepting requests
  const { duration: initialMs } = await rebuildClient(merged);
  console.log(`[bractjs] initial client build in ${initialMs}ms`);

  // Load user lifecycle hooks if defined (e.g. app/lifecycle.ts)
  let lifecycle: LifecycleHooks = {};
  try {
    const lifecyclePath = `${process.cwd()}/app/lifecycle.ts`;
    const mod = await import(lifecyclePath);
    if (mod.default) lifecycle = mod.default;
  } catch {
    // No lifecycle file — that's fine
  }

  const srv = createServer({ port: appPort, ...merged, ...lifecycle });

  watchApp(merged.appDir ?? "./app", async (file) => {
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

  console.log(`BractJS dev server on http://localhost:${appPort}`);

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
