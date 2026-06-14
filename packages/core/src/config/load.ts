import { resolve } from "node:path";
import type { BractJSConfig } from "../server/serve.ts";

/**
 * Shallow shape check for a user-supplied config object. We don't validate
 * exhaustively (plugins/adapters/hooks are opaque), but we catch the common
 * mistakes early — a string `port`, a non-array `clientEnv`, etc. — so the
 * failure surfaces here with a clear message instead of deep inside the build
 * or the request path.
 */
export function validateUserConfig(cfg: unknown): Partial<BractJSConfig> {
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
    throw new Error(
      `bractjs.config: default export must be a config object, got ${
        Array.isArray(cfg) ? "array" : typeof cfg
      }`,
    );
  }
  const c = cfg as Record<string, unknown>;

  const check = (key: string, ok: boolean, expected: string): void => {
    if (key in c && c[key] !== undefined && !ok) {
      throw new Error(`bractjs.config: "${key}" must be ${expected}`);
    }
  };

  check("port", typeof c.port === "number" && Number.isFinite(c.port), "a finite number");
  check("hmrPort", typeof c.hmrPort === "number" && Number.isFinite(c.hmrPort), "a finite number");
  check("maxRequestBodySize", typeof c.maxRequestBodySize === "number" && Number.isFinite(c.maxRequestBodySize) && c.maxRequestBodySize > 0, "a positive finite number");
  check("appDir", typeof c.appDir === "string", "a string");
  check("publicDir", typeof c.publicDir === "string", "a string");
  check("buildDir", typeof c.buildDir === "string", "a string");
  check("imageCacheDir", typeof c.imageCacheDir === "string", "a string");
  check("minify", typeof c.minify === "boolean", "a boolean");
  check(
    "sourcemap",
    typeof c.sourcemap === "string" &&
      ["none", "linked", "inline", "external"].includes(c.sourcemap as string),
    'one of "none" | "linked" | "inline" | "external"',
  );
  check(
    "clientEnv",
    Array.isArray(c.clientEnv) && c.clientEnv.every((k) => typeof k === "string"),
    "an array of strings",
  );
  check("plugins", Array.isArray(c.plugins), "an array of Bun plugins");
  check("onStart", typeof c.onStart === "function", "a function");
  check("onShutdown", typeof c.onShutdown === "function", "a function");
  check("onError", typeof c.onError === "function", "a function");
  check("ssr", typeof c.ssr === "boolean", "a boolean");
  check(
    "prerender",
    typeof c.prerender === "function" ||
      (Array.isArray(c.prerender) && c.prerender.every((p) => typeof p === "string")),
    "an array of paths or a function returning one",
  );

  return c as Partial<BractJSConfig>;
}

/**
 * Identity helper for `bractjs.config.ts` — wrap your default export to get
 * autocomplete and type-checking on the config fields (no runtime effect):
 *
 * ```ts
 * import { defineConfig } from "@bractjs/bractjs";
 * export default defineConfig({ port: 3000, clientEnv: ["PUBLIC_API_URL"] });
 * ```
 */
export function defineConfig(config: Partial<BractJSConfig>): Partial<BractJSConfig> {
  return config;
}

/**
 * Load `bractjs.config.ts` (or `.js`) from the user's cwd if present.
 * Returns an empty object when no file exists — callers fall back to defaults.
 */
export async function loadUserConfig(): Promise<Partial<BractJSConfig>> {
  for (const name of ["bractjs.config.ts", "bractjs.config.js"]) {
    const path = resolve(process.cwd(), name);
    if (!(await Bun.file(path).exists())) continue;
    const mod = await import(path);
    const cfg = mod.default ?? mod;
    return validateUserConfig(cfg ?? {});
  }
  return {};
}
