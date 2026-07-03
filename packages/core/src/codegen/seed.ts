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
