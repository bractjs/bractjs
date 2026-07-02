import { createServer, pipeline, csp } from "@bractjs/bractjs";
import { routeFiles, moduleRegistry } from "./_generated/routes.ts";
import { actionModules } from "./_generated/actions.ts";
import { manifest } from "./_generated/manifest.ts";

// Defense-in-depth behind the HTML sanitizer: a nonce-based Content-Security-
// Policy so injected <script> can't execute and forms can't post off-origin,
// even if something slips past sanitization. Applies to `bractjs start` and the
// compiled binary (both run this file); the dev server skips it so HMR's
// cross-port websocket isn't blocked by connect-src 'self'. `img-src` allows
// https so external OAuth avatars still load.
pipeline.use(csp({ directives: { "img-src": "'self' data: blob: https:" } }));

createServer({
  port: Number(process.env.PORT ?? 3200),
  appDir: "./app",
  publicDir: "./public",
  manifest,
  routeFiles,
  moduleRegistry,
  actionModules,
});
