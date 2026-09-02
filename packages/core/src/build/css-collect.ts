import { resolve } from "node:path";

/**
 * Maps each JS entry-point output to the CSS bundle(s) Bun extracted for it.
 *
 * Bun emits one CSS bundle per JS entry point that (transitively) imports CSS,
 * and reports the pairing via `Bun.build({ metafile: true })`. Because the
 * client build uses one entrypoint per route, this gives per-route CSS
 * splitting for free — a route's `cssBundle` is exactly that route's styles.
 *
 * Two shapes have to be tolerated: the declarations disagree on whether
 * `BuildOutput.metafile` is a JSON string or an already-parsed object (it is an
 * object on Bun 1.3, but the string form is documented), so parse defensively.
 *
 * Metafile keys and `cssBundle` values are **outdir-relative** (`"./route.css"`),
 * NOT cwd-relative — resolve them against `outdirAbs` to get absolute paths that
 * can be compared with `BuildArtifact.path`.
 *
 * @returns Map of absolute JS output path → absolute CSS bundle paths.
 */
export function collectCssBundles(metafile: unknown, outdirAbs: string): Map<string, string[]> {
  const byEntry = new Map<string, string[]>();
  if (!metafile) return byEntry;

  let parsed: unknown = metafile;
  if (typeof metafile === "string") {
    try {
      parsed = JSON.parse(metafile);
    } catch {
      // A malformed metafile must not fail the build — it only costs CSS links.
      return byEntry;
    }
  }

  const outputs = (parsed as { outputs?: Record<string, { cssBundle?: string }> })?.outputs;
  if (!outputs || typeof outputs !== "object") return byEntry;

  for (const [outPath, info] of Object.entries(outputs)) {
    const cssBundle = info?.cssBundle;
    if (typeof cssBundle !== "string" || cssBundle.length === 0) continue;
    const jsAbs = resolve(outdirAbs, outPath);
    const cssAbs = resolve(outdirAbs, cssBundle);
    const existing = byEntry.get(jsAbs);
    if (existing) {
      if (!existing.includes(cssAbs)) existing.push(cssAbs);
    } else {
      byEntry.set(jsAbs, [cssAbs]);
    }
  }

  return byEntry;
}
