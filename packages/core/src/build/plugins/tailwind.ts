import type { BunPlugin } from "bun";

/**
 * Resolves the Tailwind v4 bundler plugin for apps that opt in with
 * `tailwind: true` in `bractjs.config.ts`.
 *
 * Tailwind v4 is "just a CSS transform": `bun-plugin-tailwind` compiles the
 * `@import "tailwindcss"` entry, scans the source for utility candidates, and
 * hands Bun ordinary CSS. That CSS then flows through the same extraction path
 * as any other stylesheet — Bun emits it as the entry-point's `cssBundle`, and
 * BractJS hashes it and emits a `<link>`. Nothing here is BractJS-specific;
 * the plugin is only doing the Tailwind compile step that would otherwise need
 * a separate `tailwindcss` CLI invocation and a hand-written `<link>`.
 *
 * The dependency is intentionally NOT a hard dependency of the framework —
 * apps that don't use Tailwind shouldn't pay for it. It is resolved from the
 * APP's directory first: the framework itself lives in node_modules, so a bare
 * specifier would otherwise resolve against the framework's own dependency
 * tree and miss a plugin the user installed into their app (notably under
 * pnpm, which doesn't hoist).
 *
 * This module is build-time only and never reaches a compiled binary, so the
 * dynamic import is safe with respect to `bun build --compile` tracing (see
 * compile-safety.test.ts, which scans src/server only).
 */
export async function tailwindPlugins(config: { tailwind?: boolean }): Promise<BunPlugin[]> {
  if (config.tailwind !== true) return [];

  const SPECIFIER = "bun-plugin-tailwind";
  let mod: unknown;
  try {
    // Prefer the app's copy; fall back to normal resolution (monorepo/hoisted).
    let target = SPECIFIER;
    try {
      target = Bun.resolveSync(SPECIFIER, process.cwd());
    } catch {
      // Not resolvable from the app dir — let the bare import try next.
    }
    mod = await import(target);
  } catch (err) {
    throw new Error(
      `[bract] bractjs.config sets \`tailwind: true\`, but "${SPECIFIER}" could not be loaded.\n` +
        `Install it alongside Tailwind in your app:\n\n` +
        `  bun add -d ${SPECIFIER} tailwindcss\n\n` +
        `Then make sure a stylesheet with \`@import "tailwindcss";\` is imported ` +
        `from app/root.tsx (or a route).\n` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const plugin = ((mod as { default?: BunPlugin }).default ?? mod) as BunPlugin;
  if (!plugin || typeof plugin !== "object" || typeof plugin.setup !== "function") {
    throw new Error(
      `[bract] "${SPECIFIER}" did not export a valid Bun plugin (expected an object with a setup() function).`,
    );
  }
  return [plugin];
}
