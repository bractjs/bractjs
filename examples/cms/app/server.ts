import { createServer, csp, pipeline } from "@bractjs/bractjs";
import { actionModules } from "./_generated/actions.ts";
import { manifest } from "./_generated/manifest.ts";
import { moduleRegistry, routeFiles } from "./_generated/routes.ts";

// Defense-in-depth behind the HTML sanitizer: a nonce-based Content-Security-
// Policy so injected <script> can't execute and forms can't post off-origin,
// even if something slips past sanitization. Applies in every run mode: the
// compiled binary executes this file as its entrypoint, and `bractjs dev` /
// `bractjs start` import it for these pipeline.use(...) side effects (the
// createServer() call below is suppressed during that import). In dev, csp()
// automatically allows the HMR websocket in connect-src. `img-src` allows
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
