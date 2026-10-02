// Entry point for `bun build --compile` — and the home of global middleware.
//
// `bractjs dev` and `bractjs start` also import this file for its side
// effects, with the createServer() call below suppressed. That means any
// `pipeline.use(...)` registrations here (cors, csp, auth, logging) apply
// identically in dev, start, and the compiled binary:
//
//   import { pipeline, csp } from "@bractjs/bractjs";
//   pipeline.use(csp());
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
