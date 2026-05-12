import { createServer } from "../server/serve.ts";
import { createHmrServer } from "./hmr-server.ts";
import { watchApp } from "./watcher.ts";
import { rebuildClient } from "./rebuilder.ts";
import { filePathToPattern } from "../server/scanner.ts";
import { basename, extname } from "node:path";

const hmr = createHmrServer(3001);

// Build client bundle before the HTTP server starts accepting requests
const { duration: initialMs } = await rebuildClient();
console.log(`[bractjs] initial client build in ${initialMs}ms`);

createServer({ port: 3000 });

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
