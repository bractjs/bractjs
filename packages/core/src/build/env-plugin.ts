import type { BunPlugin } from "bun";
import { resolve } from "node:path";
import { extractExports } from "./directives.ts";

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

// ── Server-only module stub ────────────────────────────────────────────────

const SERVER_FILE_RE = /\.server\.(tsx?|jsx?)$/;
const DEFAULT_EXPORT_RE = /^export\s+default\b/m;

// Runtime stub injected for every named/default export of a `*.server.ts`
// module on the client. It is a callable Proxy that throws on call AND on
// property access, so:
//   • the route module's loader/action keep referencing the symbols (the
//     bundle still resolves `import { db } from "./db.server.ts"`), and
//   • the bodies are inert dead code on the client (the server runs them), but
//   • any *accidental* use from real client code throws a clear error instead
//     of silently shipping a broken `undefined`.
const SERVER_STUB_FACTORY = `const __bractServerStub = (name) => {
  const fail = () => {
    throw new Error(
      "[BractJS] '" + name + "' comes from a *.server.ts module and is not " +
      "available in the browser. Call it only inside a loader() or action()."
    );
  };
  return new Proxy(fail, { get: (_t, prop) => (prop === "name" ? name : fail()), apply: fail });
};`;

/**
 * Client build: replace every export of a `*.server.ts` module with an inert
 * stub instead of hard-failing the build.
 *
 * BractJS ships the *entire* route module — loader and action included — to the
 * client bundle (the server never strips them). A route that legitimately does
 * `import { db } from "./db.server.ts"` inside its loader therefore drags the
 * server module into the client graph. Hard-failing that import (the old
 * `serverOnlyPlugin` behaviour) made the documented "import a server module in
 * a loader" pattern impossible. Stubbing instead:
 *   - keeps named/default imports resolvable, so the route module compiles,
 *   - guarantees **zero** server source (DB drivers, secrets, `bun:sqlite`,
 *     etc.) reaches the browser — the original file is never read for content,
 *   - throws loudly if a stub is ever actually used on the client.
 *
 * Loaders/actions are dead code on the client (only the server invokes them),
 * so the stubs are never called in correct usage.
 */
export const serverModuleStubPlugin: BunPlugin = {
  name: "bractjs-server-module-stub",
  setup(build) {
    build.onLoad({ filter: SERVER_FILE_RE }, async ({ path }) => {
      const src = await Bun.file(path).text();
      const names = extractExports(src);
      const lines = [SERVER_STUB_FACTORY];
      for (const name of names) {
        lines.push(`export const ${name} = __bractServerStub(${JSON.stringify(name)});`);
      }
      if (DEFAULT_EXPORT_RE.test(src)) {
        lines.push(`export default __bractServerStub("default");`);
      }
      // `export {};` guarantees the module is treated as ESM even when the
      // server file had no statically-detectable exports.
      lines.push("export {};");
      return { contents: lines.join("\n"), loader: "ts" };
    });
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
