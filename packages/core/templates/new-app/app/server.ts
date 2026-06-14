// Entry point for `bun build --compile`.
//
// Pre-generated registries below come from `bractjs codegen:registry` and
// `bractjs codegen:manifest`. They turn every runtime fs scan / dynamic
// import the framework would normally do into static, traceable imports so
// `bun build --compile` can produce a single executable.
//
// Generate-then-compile:
//   bractjs codegen:registry             # writes routes.ts + actions.ts
//   bractjs build                        # writes build/client/* + manifest
//   bractjs codegen:manifest             # snapshots manifest into TS
//   bun build --compile app/server.ts --outfile myapp [--asset build/client/]
//
// Or run all of the above in one shot:
//   bractjs compile

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
