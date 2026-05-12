import { resolve, join } from "node:path";

/**
 * Dev-only HTTP handler for /_hmr/module?file=routes/about.tsx
 *
 * Compiles the requested route file on-demand (in-memory, no outdir) and
 * returns it as ESM so the browser can dynamically import it for module swap.
 *
 * Security: rejects any path that resolves outside appDir.
 */
export async function handleHmrModuleRequest(
  url: URL,
  appDir: string,
): Promise<Response> {
  const file = url.searchParams.get("file");
  if (!file) {
    return new Response("Missing file param", { status: 400 });
  }

  // Resolve and guard against path traversal
  const rootDir = resolve(appDir);
  const fullPath = resolve(join(rootDir, file));
  if (!fullPath.startsWith(rootDir + "/") && fullPath !== rootDir) {
    return new Response("Forbidden", { status: 403 });
  }

  // Build in-memory (no outdir → outputs held in memory, no disk write)
  const result = await Bun.build({
    entrypoints: [fullPath],
    target: "browser",
    minify: false,
    sourcemap: "inline",
  });

  if (!result.success || result.outputs.length === 0) {
    const msgs = result.logs.map((l) => String(l)).join("\n");
    return new Response(`Build failed:\n${msgs}`, { status: 500 });
  }

  const js = await result.outputs[0].text();
  return new Response(js, {
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "no-store",
    },
  });
}
