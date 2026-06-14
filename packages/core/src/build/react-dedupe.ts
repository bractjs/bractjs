import type { BunPlugin } from "bun";

/**
 * Force every `react` / `react-dom` import in the CLIENT bundle to resolve to a
 * single physical copy (the app's cwd copy).
 *
 * The client build mixes entrypoints from two roots: the framework's
 * `src/client/entry.tsx` (which resolves react from the framework's
 * node_modules) and the app's route files (which resolve react from the app's
 * node_modules). When the `file:..`-linked framework carries its own react copy
 * — even at the same version — those are two distinct module instances. The
 * result is a dual-React "invalid hook call" (`ReactSharedInternals.H` is null)
 * the moment a `"use client"` component runs a hook during hydration.
 *
 * Pinning all react specifiers to one resolved path eliminates the duplication.
 */
const REACT_RE = /^(react|react-dom)(\/.*)?$/;

export function reactDedupePlugin(appCwd: string = process.cwd()): BunPlugin {
  const cache = new Map<string, string>();
  const resolveOne = (spec: string): string | null => {
    if (cache.has(spec)) return cache.get(spec)!;
    try {
      const resolved = Bun.resolveSync(spec, appCwd);
      cache.set(spec, resolved);
      return resolved;
    } catch {
      return null;
    }
  };

  return {
    name: "bractjs:react-dedupe",
    setup(build) {
      build.onResolve({ filter: REACT_RE }, (args) => {
        const resolved = resolveOne(args.path);
        return resolved ? { path: resolved } : undefined;
      });
    },
  };
}
