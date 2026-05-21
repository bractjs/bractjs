import type { BunPlugin } from "bun";
import { resolve } from "node:path";

// Lazy: this module is re-exported from the package barrel, so it may be
// statically pulled into client bundles. `import.meta.dir` is undefined in the
// browser, and a top-level `resolve(import.meta.dir, "..")` would throw
// "Path must be a string" at module load — before any plugin is even invoked.
// Defer the resolve until a plugin actually runs (always server-side).
let frameworkSrcRoot: string | undefined;
function getFrameworkSrcRoot(): string {
  if (frameworkSrcRoot === undefined) {
    frameworkSrcRoot = resolve(import.meta.dir, "..");
  }
  return frameworkSrcRoot;
}

// ── Server-only import guard ───────────────────────────────────────────────

/**
 * Blocks any import matching *.server.ts / *.server.tsx during client builds.
 * Uses a two-step plugin: onResolve redirects to a virtual namespace,
 * then onLoad throws a hard build error.
 */
export const serverOnlyPlugin: BunPlugin = {
  name: "bractjs-server-only",
  setup(build) {
    build.onResolve({ filter: /\.server(\.(tsx?|jsx?))?$/ }, (args) => ({
      path: args.path,
      namespace: "bractjs-server-only",
    }));

    build.onLoad(
      { filter: /.*/, namespace: "bractjs-server-only" },
      (args) => {
        throw new Error(
          `[BractJS] Cannot import "${args.path}" in client code.\n` +
            `Move this to a loader() or action().`,
        );
      },
    );
  },
};

// ── Client env allowlist ───────────────────────────────────────────────────

/**
 * Replaces process.env.KEY with string literals for allowed keys.
 * All other process.env.* references become the string "undefined".
 */
export function clientEnvPlugin(
  allowedKeys: string[],
  envValues: Record<string, string>,
): BunPlugin {
  return {
    name: "bractjs-client-env",
    setup(build) {
      build.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
        // Skip third-party packages and the framework's own source. The
        // framework source contains literal strings like
        // `"process.env.NODE_ENV"` (as keys of Bun.build's `define:` maps)
        // that would otherwise be rewritten to `""undefined""`, breaking
        // syntax. The framework also doesn't need allowlist enforcement —
        // it accesses Bun.env directly on the server, not process.env on
        // the client. Without this guard, linking the framework via `file:`
        // produces a build that fails to parse its own source.
        if (args.path.includes("/node_modules/")) return undefined;
        if (args.path.startsWith(getFrameworkSrcRoot())) return undefined;
        const src = await Bun.file(args.path).text();
        // SECURITY(medium): textual regex replace runs over the whole source,
        // including inside string literals and comments. A bare `process.env.X`
        // anywhere in user code — even in a documentation string — becomes
        // the literal value (or "undefined"). This is acceptable for client
        // builds because unwanted occurrences only yield the string
        // "undefined", never a server secret. The allowedKeys gate is the
        // authoritative leak check; never widen it without auditing callers.
        const contents = src.replace(
          /process\.env\.([A-Z_][A-Z0-9_]*)/g,
          (_match, key: string) =>
            allowedKeys.includes(key)
              ? JSON.stringify(envValues[key] ?? "")
              : '"undefined"',
        );
        return { contents, loader: args.loader };
      });
    },
  };
}
