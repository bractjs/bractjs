/**
 * @bractjs/bractjs/codegen — code-generation entry.
 *
 * The registry/manifest generators that drive the native `bun build --compile`
 * workflow (the compiled binary cannot scan the filesystem, so routes and
 * actions are baked into generated modules), plus the typed-route staleness
 * helpers. `bractjs codegen` / `codegen:registry` / `codegen:manifest` wrap
 * these; import them here for custom pipelines.
 */
export type { CodegenResult } from "./codegen/module-registry.ts";
export { generateActionRegistry, generateManifestModule, generateRouteRegistry, writeManifestModule, writeModuleRegistries, } from "./codegen/module-registry.ts";
export { explainStaleness, routesFingerprint } from "./codegen/route-codegen.ts";
