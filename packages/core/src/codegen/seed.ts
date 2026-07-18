import { join } from "node:path";
import { writeModuleRegistries } from "./module-registry.ts";
import { writeRouteTypes } from "./route-codegen.ts";

// Stub manifest written so `app/server.ts` (the compile/`start` entry, which
// statically imports `_generated/manifest.ts`) typechecks before a real build
// exists. `bractjs codegen:manifest` overwrites it with the built manifest.
const MANIFEST_STUB = [
  "// Stub manifest — replaced by `bractjs codegen:manifest` after running",
  "// `bractjs build`. Lets `app/server.ts` typecheck before the first build.",
  `import type { ServerManifest } from "@bractjs/bractjs";`,
  `export const manifest: ServerManifest = { clientEntry: "/build/client/client.js", routes: {} };`,
  "",
].join("\n");

/**
 * Seed `<appDir>/_generated/` so `app/server.ts` typechecks before the first
 * build: route/action registries (`routes.ts`, `actions.ts`), typed routes
 * (`route-types.gen.ts`), and a manifest stub (`manifest.ts`). The generated
 * files are gitignored and regenerated on demand — this is what makes a fresh
 * clone (or CI) typecheck without first running a build.
 *
 * Shared by `bractjs new` (scaffold seeding) and `bractjs codegen:seed`.
 *
 * @param appDir absolute path to the app directory (the one containing `routes/`).
 */
export async function seedGenerated(appDir: string): Promise<void> {
  await writeModuleRegistries(appDir);
  await writeRouteTypes(appDir);
  await Bun.write(join(appDir, "_generated", "manifest.ts"), MANIFEST_STUB);
}

/**
 * Seed only what's missing so `<appDir>/server.ts` is importable (its static
 * `_generated/*` imports resolve). Unlike seedGenerated, this never overwrites
 * an existing `manifest.ts` — `bractjs codegen:manifest` may have snapshotted a
 * real build there. Returns true when anything was written.
 */
export async function seedGeneratedIfMissing(appDir: string): Promise<boolean> {
  const gen = join(appDir, "_generated");
  const missingRegistries =
    !(await Bun.file(join(gen, "routes.ts")).exists()) || !(await Bun.file(join(gen, "actions.ts")).exists());
  const missingManifest = !(await Bun.file(join(gen, "manifest.ts")).exists());
  if (!missingRegistries && !missingManifest) return false;
  if (missingRegistries) await writeModuleRegistries(appDir);
  if (missingManifest) await Bun.write(join(gen, "manifest.ts"), MANIFEST_STUB);
  return true;
}
