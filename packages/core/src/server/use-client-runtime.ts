import { resolve } from "node:path";
import { extractExports, hasClientDirective } from "../build/directives.ts";

/**
 * Runtime stubbing of `"use client"` modules during SSR, for the source-import
 * code path.
 *
 * The compiled server bundle (`bun build --compile`) applies
 * `useClientStubPlugin`, replacing every `"use client"` export with a
 * `() => null` component so SSR never calls browser-only hooks/APIs. But both
 * the dev server AND `bractjs start` render route modules via a raw `import()`
 * of the SOURCE (they fall back to `scanRoutes` + dynamic import rather than the
 * pre-stubbed bundle). Without this, a `"use client"` route component executes
 * on the server and crashes on `useState`/`useRef` ("Invalid hook call").
 *
 * Registering this `Bun.plugin` makes the server process apply the same
 * transform at module-load time. It only affects this process's `import()`
 * (SSR) — the separately bundled client still ships the real component, so
 * hydration restores interactivity in the browser.
 *
 * The filter is scoped to source files UNDER appDir (never node_modules): a
 * runtime onLoad must always return an object, so any matched non-client file is
 * passed through verbatim, and we must not re-transpile third-party packages
 * (doing so breaks CJS interop shapes such as react/jsx-dev-runtime).
 *
 * Idempotent: safe to call more than once per process.
 */
let installed = false;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function installUseClientServerStub(appDir = "./app"): void {
  if (installed) return;
  installed = true;

  const absAppDir = resolve(appDir);
  const filter = new RegExp(`^${escapeRegExp(absAppDir)}.*\\.(tsx?|jsx?)$`);

  Bun.plugin({
    name: "bractjs:use-client-server-stub",
    setup(build) {
      build.onLoad({ filter }, async ({ path }) => {
        const src = await Bun.file(path).text();
        const loader = path.endsWith(".tsx")
          ? "tsx"
          : path.endsWith(".jsx")
            ? "jsx"
            : path.endsWith(".ts")
              ? "ts"
              : "js";
        if (!hasClientDirective(src)) {
          // Runtime onLoad must return an object; pass app source through. Bun
          // transpiles app TS/TSX anyway, so this is a no-op in practice.
          return { contents: src, loader };
        }
        const names = extractExports(src).filter((n) => n !== "default");
        const stubs = names.map((n) => `export const ${n} = () => null;`);
        // Always provide a null default — a "use client" module rendered on the
        // server should yield nothing, regardless of how default is declared
        // (which `extractExports` can't always detect, e.g. `export default X`).
        stubs.push("export default () => null;");
        return { contents: stubs.join("\n"), loader: "ts" };
      });
    },
  });
}
