/**
 * Static guardrail for the `bun build --compile` single-executable feature.
 *
 * `bun build --compile` CANNOT trace two things at runtime:
 *   1. `Bun.Glob(...).scan()` filesystem scans
 *   2. dynamic `import(<variable>)` calls
 *
 * The framework supports single-binary deployment by materialising routes,
 * layouts, actions, and the manifest into STATIC imports (`app/_generated/*`)
 * and having `createServer()` accept them via `routeFiles` / `moduleRegistry`
 * / `actionModules` / `manifest`. The registry-mode code path therefore must
 * contain NO glob scans and NO variable `import()` — otherwise the compiled
 * binary silently breaks at request time.
 *
 * This test scans the server source (the only graph compiled into the binary)
 * and fails if a NEW unguarded `Bun.Glob` / variable-`import()` appears outside
 * the known dev-fallback functions. It runs in milliseconds — a fast tripwire
 * that complements the heavyweight compile-smoke e2e test.
 *
 * NOTE: `src/client/**` is intentionally NOT scanned — the client bundle is
 * built for the browser (target=browser) and lazy-loads route chunks via
 * dynamic `import(chunkUrl)`, which is correct there. Only the SERVER binary is
 * subject to `bun build --compile` tracing. `src/dev/**` is also excluded: it
 * never ships in a production/compiled server (all dev endpoints are gated by
 * `isExplicitDev()` and dev modules are loaded via string-literal imports).
 */
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const SERVER_DIR = resolve(import.meta.dir, "../server");

// Occurrences of fs-scan / variable-import that are KNOWN-SAFE because they
// live in the dev-fallback path, which is skipped whenever the registry config
// (routeFiles / actionModules / moduleRegistry) is provided — i.e. always in a
// compiled binary. Keyed by file (relative to src/server) → the substrings of
// the enclosing dev-fallback function/usage we accept.
//
// If you add a new fs-scan or variable-import on the server path, this test
// will fail. Either gate it behind the registry config (and the isExplicitDev
// pattern), or — if it is genuinely a new dev-only fallback — extend this map
// with a justification.
const ALLOWED: Record<string, string[]> = {
  // scanRoutes(): the startup route scan, bypassed when `routeFiles` is set
  // (see buildFetchHandler in serve.ts).
  "scanner.ts": ["routes/**/*.{tsx,ts}"],
  // loadServerActions(): the startup action scan + dynamic import, bypassed
  // when `actionModules` is set. loadServerActionsFromRegistry() is the
  // compiled-binary counterpart and uses neither.
  "action-registry.ts": ["**/*.{ts,tsx}", "await import(filePath)"],
  // importRouteModule(): dev-mode route module load. resolveRouteChain() only
  // calls it when no `registry` is provided; registry mode uses pickRouteModule
  // (a plain Record lookup, no import).
  "layout.ts": ["await import(filePath)"],
  // renderSpaShell(): source-mode root.tsx load for the SPA shell. Compiled
  // binaries always pass a moduleRegistry, which takes the registry branch
  // (plain Record lookup) before this import is reached.
  "spa.ts": ["await import(rootPath)"],
};

async function serverFiles(): Promise<string[]> {
  const glob = new Bun.Glob("**/*.ts");
  const out: string[] = [];
  for await (const rel of glob.scan(SERVER_DIR)) out.push(rel);
  return out.sort();
}

// A dynamic import whose argument is NOT a single string literal. We allow
//   import("./literal.ts")   import('../x.ts')
// and reject
//   import(filePath)   import(`${x}`)   import(someVar)
const VARIABLE_IMPORT_RE = /\bimport\(\s*(?!["'])/;
const STRING_LITERAL_IMPORT_RE = /\bimport\(\s*["'][^"']+["']\s*\)/;

// Return the executable (non-comment) lines of a source file.
//
// We deliberately avoid regex comment-stripping over the whole file: glob
// patterns and route literals contain comment-terminator and slash sequences
// inside string literals, and a naive block-comment regex spans across them
// and corrupts real code (e.g. swallowing a later `import(filePath)`),
// producing false negatives. A line-oriented filter is coarse but safe for our
// purpose — detecting `import(...)` / `Bun.Glob` constructs, which never
// legitimately begin inside a doc-comment block in this codebase.
function codeLines(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of src.split("\n")) {
    const line = raw;
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    // Whole-line block comment open without close on the same line.
    if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
      inBlock = true;
      continue;
    }
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
    out.push(line);
  }
  return out;
}

/** A line carries a runtime dynamic import with a non-literal argument. */
function hasVariableImport(line: string): boolean {
  // Ignore type-position imports like `import("bun").BunPlugin`.
  const cleaned = line.replace(/import\(\s*["'][^"']+["']\s*\)\s*\./g, "TYPE.");
  return VARIABLE_IMPORT_RE.test(cleaned);
}

describe("compile-safety: server path is single-binary compatible", () => {
  test("no Bun.Glob/.scan() on the server path outside dev-fallback functions", async () => {
    const files = await serverFiles();
    const violations: string[] = [];

    for (const rel of files) {
      // Use the RAW source here: glob patterns like "**/*.{tsx,ts}" contain a
      // literal `*/` that a naive comment-stripper would mistake for a comment
      // terminator and corrupt the string.
      const src = await Bun.file(resolve(SERVER_DIR, rel)).text();
      if (!/new Bun\.Glob|\.scan\(/.test(src)) continue;
      const allowed = ALLOWED[rel] ?? [];
      // Accept only if the file's glob usage matches an allowlisted pattern.
      const ok = allowed.some((a) => src.includes(a));
      if (!ok) violations.push(rel);
    }

    expect(violations).toEqual([]);
  });

  test("no variable (non-literal) dynamic import() on the server path outside dev-fallback functions", async () => {
    const files = await serverFiles();
    const violations: string[] = [];

    for (const rel of files) {
      const lines = codeLines(await Bun.file(resolve(SERVER_DIR, rel)).text());
      const offending = lines.filter(hasVariableImport);
      if (offending.length === 0) continue;
      const allowed = ALLOWED[rel] ?? [];
      // Every offending line must match an allowlisted dev-fallback construct.
      const ok = offending.every((line) => allowed.some((a) => line.includes(a)));
      if (!ok) violations.push(`${rel}: ${offending.map((l) => l.trim()).join(" | ")}`);
    }

    expect(violations).toEqual([]);
  });

  test("self-check: the allowlisted files really do still contain their guarded constructs", async () => {
    // Guards against the allowlist going stale (e.g. a file is refactored so the
    // construct moves, leaving a dead allowlist entry that would mask a future
    // real violation in that file).
    for (const [rel, needles] of Object.entries(ALLOWED)) {
      const src = await Bun.file(resolve(SERVER_DIR, rel)).text();
      for (const needle of needles) {
        expect(src.includes(needle)).toBe(true);
      }
    }
  });

  test("serve.ts dynamic imports are all string literals (traceable by bun build --compile)", async () => {
    const lines = codeLines(await Bun.file(resolve(SERVER_DIR, "serve.ts")).text());
    for (const line of lines) {
      // Skip type-position imports like `import("bun").BunPlugin[]`.
      const cleaned = line.replace(/import\(\s*["'][^"']+["']\s*\)\s*[.[]/g, "TYPE");
      if (!/\bimport\(/.test(cleaned)) continue;
      // Any remaining runtime import( on this line must be a string literal.
      expect(line).toMatch(STRING_LITERAL_IMPORT_RE);
    }
  });
});
