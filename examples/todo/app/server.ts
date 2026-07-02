import { createServer } from "@bractjs/bractjs";
import { routeFiles, moduleRegistry } from "./_generated/routes.ts";
import { actionModules } from "./_generated/actions.ts";
import { manifest } from "./_generated/manifest.ts";

createServer({
  port: Number(process.env.PORT ?? 3000),
  appDir: "./app",
  publicDir: "./public",
  manifest,
  routeFiles,
  moduleRegistry,
  actionModules,
});
