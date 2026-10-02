import { createServer } from "@bractjs/bractjs";
import config from "../bractjs.config.ts";
import { actionModules } from "./_generated/actions.ts";
import { manifest } from "./_generated/manifest.ts";
import { moduleRegistry, routeFiles } from "./_generated/routes.ts";

createServer({
  // bractjs.config.ts applies here too (i18n, ssr, streamTimeout, …): this file
  // is the entry of the compiled binary and the Node.js build, which don't
  // read the config file at runtime. PORT still wins over the config's port.
  ...config,
  port: Number(process.env.PORT ?? config.port ?? 3000),
  appDir: "./app",
  publicDir: "./public",
  manifest,
  routeFiles,
  moduleRegistry,
  actionModules,
});
