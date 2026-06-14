import type { BractJSConfig } from "../server/serve.ts";

/**
 * Builds the `define` map passed to Bun.build() for the client bundle.
 * Always injects process.env.NODE_ENV = "production".
 * For each key in config.clientEnv, injects process.env.KEY = value from Bun.env.
 */
export function buildDefines(config: Pick<BractJSConfig, "clientEnv">): Record<string, string> {
  const defines: Record<string, string> = {
    "process.env.NODE_ENV": JSON.stringify("production"),
  };
  for (const key of config.clientEnv ?? []) {
    defines[`process.env.${key}`] = JSON.stringify(Bun.env[key] ?? "");
  }
  return defines;
}
