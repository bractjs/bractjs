import { createServer } from "../server/serve.ts";
import { setRuntimeMode } from "../server/env.ts";
import { createHmrServer } from "./hmr-server.ts";
import { watchApp } from "./watcher.ts";
import { rebuildClient } from "./rebuilder.ts";
import { filePathToPattern } from "../server/scanner.ts";
import { basename, extname } from "node:path";
import type { LifecycleHooks } from "../server/lifecycle.ts";

// Must precede any user-code import so SSR-time isDevRuntime() checks
// (e.g. inside <LiveReload>) observe the dev mode.
setRuntimeMode("dev");

const hmr = createHmrServer(3001);

// Build client bundle before the HTTP server starts accepting requests
const { duration: initialMs } = await rebuildClient();
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

createServer({ port: 3000, ...lifecycle });

watchApp("./app", async (file) => {
  const { duration } = await rebuildClient();

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

console.log("BractJS dev server on http://localhost:3000");
