import { resolve } from "node:path";
import type { BractJSConfig } from "../server/serve.ts";

/**
 * Load `bractjs.config.ts` (or `.js`) from the user's cwd if present.
 * Returns an empty object when no file exists — callers fall back to defaults.
 */
export async function loadUserConfig(): Promise<Partial<BractJSConfig>> {
  for (const name of ["bractjs.config.ts", "bractjs.config.js"]) {
    const path = resolve(process.cwd(), name);
    if (!(await Bun.file(path).exists())) continue;
    const mod = await import(path);
    const cfg = (mod.default ?? mod) as Partial<BractJSConfig>;
    return cfg ?? {};
  }
  return {};
}
