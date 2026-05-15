import type { BunPlugin } from "bun";

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
        if (args.path.includes("/node_modules/")) return undefined;
        const src = await Bun.file(args.path).text();
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
