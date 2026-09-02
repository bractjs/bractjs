/**
 * Seed `<appDir>/_generated/` so `app/server.ts` typechecks before the first
 * build: route/action registries (`routes.ts`, `actions.ts`), typed routes
 * (`route-types.gen.ts`), a manifest stub (`manifest.ts`), and ambient CSS
 * module types (`css.d.ts`). The generated files are gitignored and regenerated
 * on demand — this is what makes a fresh clone (or CI) typecheck without first
 * running a build.
 *
 * Shared by `bractjs new` (scaffold seeding) and `bractjs codegen:seed`.
 *
 * @param appDir absolute path to the app directory (the one containing `routes/`).
 */
export declare function seedGenerated(appDir: string): Promise<void>;
/**
 * Seed only what's missing so `<appDir>/server.ts` is importable (its static
 * `_generated/*` imports resolve). Unlike seedGenerated, this never overwrites
 * an existing `manifest.ts` — `bractjs codegen:manifest` may have snapshotted a
 * real build there. Returns true when anything was written.
 */
export declare function seedGeneratedIfMissing(appDir: string): Promise<boolean>;
