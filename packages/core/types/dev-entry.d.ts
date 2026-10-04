/**
 * @bractjs/bractjs/dev — the development server, for programmatic use.
 *
 * `createDevServer()` is what `bractjs dev` runs: file watching, HMR, live
 * loader/action edits, and the dev error overlay. It lives on its own subpath
 * so the root import (which route modules share with the browser) carries no
 * dev-server code.
 */
export type { DevServer, DevServerOptions } from "./dev/server.ts";
export { createDevServer, DevServerError } from "./dev/server.ts";
