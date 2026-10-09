import type { BunPlugin } from "bun";
/**
 * Blocks any import matching *.server.ts / *.server.tsx during client builds.
 * Uses a two-step plugin: onResolve redirects to a virtual namespace,
 * then onLoad throws a hard build error.
 */
export declare const serverOnlyPlugin: BunPlugin;
/**
 * Client build: replace every export of a `*.server.ts` module with an inert
 * stub instead of hard-failing the build.
 *
 * BractJS ships the *entire* route module — loader and action included — to the
 * client bundle (the server never strips them). A route that legitimately does
 * `import { db } from "./db.server.ts"` inside its loader therefore drags the
 * server module into the client graph. Hard-failing that import (the old
 * `serverOnlyPlugin` behaviour) made the documented "import a server module in
 * a loader" pattern impossible. Stubbing instead:
 *   - keeps named/default imports resolvable, so the route module compiles,
 *   - guarantees **zero** server source (DB drivers, secrets, `bun:sqlite`,
 *     etc.) reaches the browser — the original file is never read for content,
 *   - throws loudly if a stub is ever actually used on the client.
 *
 * Loaders/actions are dead code on the client (only the server invokes them),
 * so the stubs are never called in correct usage.
 */
export declare const serverModuleStubPlugin: BunPlugin;
/**
 * The client env rewrite itself (also applied by `routeShakePlugin`, whose
 * onLoad answers for route modules before this plugin's would).
 *
 * SECURITY(medium): textual regex replace runs over the whole source,
 * including inside string literals and comments. A bare `process.env.X`
 * anywhere in user code — even in a documentation string — becomes the
 * literal value (or "undefined"). This is acceptable for client builds
 * because unwanted occurrences only yield the string "undefined", never a
 * server secret. The allowedKeys gate is the authoritative leak check; never
 * widen it without auditing callers.
 */
export declare function rewriteClientEnv(src: string, allowedKeys: string[], envValues: Record<string, string>): string;
/**
 * Replaces process.env.KEY with string literals for allowed keys.
 * All other process.env.* references become the string "undefined".
 */
export declare function clientEnvPlugin(allowedKeys: string[], envValues: Record<string, string>): BunPlugin;
