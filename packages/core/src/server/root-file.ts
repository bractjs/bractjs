// One answer to "which file is the app's root module?" — `root.tsx`, else
// `root.ts`, else none. Every probe (the dev chain, the SPA shell, both
// bundlers and codegen) goes through here so a `root.ts` app behaves the same
// in every run mode.
//
// Namespace imports, as in runtime.ts: this module is reachable from the
// client build through the package barrel.
import * as fs from "node:fs";
import { join, resolve } from "node:path";
import { fileExists } from "./runtime.ts";

/** Root module file names, in precedence order. */
export const ROOT_FILES = ["root.tsx", "root.ts"] as const;
export type RootFileName = (typeof ROOT_FILES)[number];

/** The app's root module file name, or null when it has none. */
export async function resolveRootFile(appDir: string): Promise<RootFileName | null> {
  for (const name of ROOT_FILES) {
    if (await fileExists(resolve(join(appDir, name)))) return name;
  }
  return null;
}

/** {@link resolveRootFile}, synchronously (build tooling). */
export function resolveRootFileSync(appDir: string): RootFileName | null {
  for (const name of ROOT_FILES) {
    if (fs.existsSync(resolve(join(appDir, name)))) return name;
  }
  return null;
}

/** The root module's key in a codegen'd module registry, if it has one. */
export function rootKeyIn(registry: Record<string, unknown>): RootFileName | undefined {
  return ROOT_FILES.find((name) => registry[name] !== undefined);
}
