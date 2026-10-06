import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { seedGeneratedIfMissing } from "../codegen/seed.ts";
import { installCssModulesRuntime } from "../server/css-modules-runtime.ts";
import type { LifecycleHooks } from "../server/lifecycle.ts";
import { setCreateServerSuppressed } from "../server/serve.ts";
import { installUseClientServerStub } from "../server/use-client-runtime.ts";

// Deliberately NOT in src/server/: this module does a variable `import()` of a
// user file, which the compile-safety scan forbids on the compiled-binary
// graph. It is only ever imported by bin/cli.ts and src/dev/server.ts — never
// by app/server.ts (the binary entry) — so it stays out of that graph.

/**
 * The runtime plugins source-imported app code needs on the server (CSS
 * Module class maps, `"use client"` stubs). They only apply to modules loaded
 * AFTER registration, and server.ts / lifecycle.ts import route modules
 * transitively — so install them before either is imported. createServer()
 * installs them too, as a backstop for programmatic callers.
 */
function installSourceImportRuntime(appDir: string): void {
  installCssModulesRuntime();
  installUseClientServerStub(appDir);
}

export interface ServerEntryResult {
  /** True when `<appDir>/server.ts` existed and evaluated without throwing. */
  loaded: boolean;
  /** Set when the file exists but its import threw (its `pipeline.use(...)` registrations may be missing or partial). */
  error?: unknown;
}

/**
 * Import `<appDir>/server.ts` for its side effects (global `pipeline.use(...)`
 * registrations) with its module-scope `createServer()` call suppressed, so
 * `bractjs dev` / `bractjs start` pick up the same middleware the compiled
 * binary gets when it runs the file as its entrypoint.
 *
 * Idempotent per process: a second call hits Bun's module cache, so the file's
 * top-level code (and its pipeline.use calls) run at most once.
 */
export async function loadServerEntry(appDir: string): Promise<ServerEntryResult> {
  const entryPath = resolve(process.cwd(), appDir, "server.ts");
  if (!existsSync(entryPath)) return { loaded: false };
  installSourceImportRuntime(appDir);

  // server.ts statically imports `_generated/*`; on a fresh clone those
  // gitignored files don't exist yet and the import would throw.
  try {
    if (await seedGeneratedIfMissing(resolve(process.cwd(), appDir))) {
      console.log("[bractjs] seeded missing app/_generated/* so server.ts is importable");
    }
  } catch {
    // Seeding is best-effort; the import below surfaces the real failure.
  }

  setCreateServerSuppressed(true);
  try {
    await import(entryPath);
    return { loaded: true };
  } catch (error) {
    return { loaded: false, error };
  } finally {
    setCreateServerSuppressed(false);
  }
}

/**
 * Load `<appDir>/lifecycle.ts` hooks (default export). Missing file → `{}`.
 * A file that exists but fails to import warns instead of being silently
 * swallowed — a broken lifecycle.ts should not look like "no lifecycle.ts".
 */
export async function loadLifecycleModule(appDir: string): Promise<LifecycleHooks> {
  const lifecyclePath = resolve(process.cwd(), appDir, "lifecycle.ts");
  if (!existsSync(lifecyclePath)) return {};
  installSourceImportRuntime(appDir);
  try {
    const mod = (await import(lifecyclePath)) as { default?: LifecycleHooks };
    return mod.default ?? {};
  } catch (err) {
    console.warn(
      "[bractjs] app/lifecycle.ts exists but failed to load — lifecycle hooks inactive:",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

/**
 * Import `<appDir>/env.ts` (see `defineEnv`) so missing or invalid environment
 * variables stop startup with the full list, before anything else runs. No
 * env.ts → no-op. Errors propagate: callers report them and exit.
 */
export async function loadEnvModule(appDir: string): Promise<void> {
  const envPath = resolve(process.cwd(), appDir, "env.ts");
  if (!existsSync(envPath)) return;
  await import(envPath);
}
