import { realpathSync } from "node:fs";

/**
 * Server-side class-name maps for CSS Modules, for the source-import code path.
 *
 * The client bundle (`Bun.build`) scopes `*.module.css` natively: the import
 * becomes `{ card: "card_DnIJww" }`. But `bractjs dev`, `bractjs start` and
 * prerendering import route modules from SOURCE, and Bun's runtime resolves a
 * `.module.css` import to a file path, not that map — so SSR rendered no class
 * where the browser rendered the scoped one (a hydration mismatch, and unstyled
 * server HTML).
 *
 * This runtime `Bun.plugin` makes the server's import produce the bundler's own
 * map: it bundles a one-line wrapper (`export { default } from "<file>"`) with
 * `Bun.build` and returns the result. Bun derives scoped names from the
 * stylesheet's absolute path alone (not content, cwd, target or minify), so
 * the server gets exactly the names the client bundle uses, provided both
 * processes run from the same working directory (names are derived from the
 * path relative to it) — true for `bractjs dev`, which builds the client in
 * the server process, and for `bractjs build` + `bractjs start` run from the
 * app root. (Bun can spell a path through a symlink differently in the two
 * builds, so an app dir reached through a symlink may not match.)
 *
 * Only this process's `import()` is affected; the client bundler never sees
 * the plugin. The compiled binary doesn't need it — `bun build --compile`
 * bundles the maps in — so callers skip it when a module registry is supplied.
 *
 * Idempotent: safe to call more than once per process.
 */
let installed = false;

/** The generated map module per loaded stylesheet, keyed by realpath (for dev change detection). */
const loadedMaps = new Map<string, string>();

export function installCssModulesRuntime(): void {
  if (installed) return;
  installed = true;

  Bun.plugin({
    name: "bractjs:css-modules-runtime",
    setup(build) {
      build.onLoad({ filter: /\.module\.css$/ }, async ({ path }) => {
        const code = await buildClassMapModule(path);
        loadedMaps.set(realpath(path), code);
        return { contents: code, loader: "js" };
      });
    },
  });
}

/**
 * Called by the dev server after a `.module.css` edit. Editing rules keeps the
 * class names (they depend only on the path), so a stylesheet swap is enough;
 * adding or removing a class changes the map already baked into the running
 * server's imports and the client's JS, which needs a restart. Returns true in
 * that case. Files the server never imported report false.
 */
export async function cssModuleClassesChanged(path: string): Promise<boolean> {
  const real = realpath(path);
  const before = loadedMaps.get(real);
  if (before === undefined) return false;
  try {
    // The module text is the class map itself: it changes exactly when a
    // class (or a `composes`) is added, removed or renamed.
    const after = await buildClassMapModule(real);
    loadedMaps.set(real, after);
    return after !== before;
  } catch {
    // Mid-edit syntax errors: the next save decides.
    return false;
  }
}

/** Bun's own bundled output for `export { default } from "<stylesheet>"`: the class map as ESM. */
async function buildClassMapModule(path: string): Promise<string> {
  const real = realpath(path);
  const wrapper = "/__bractjs_css_module__.ts";
  const result = await Bun.build({
    entrypoints: [wrapper],
    target: "bun",
    files: { [wrapper]: `export { default } from ${JSON.stringify(real)};` },
  });
  const entry = result.success ? result.outputs.find((o) => o.kind === "entry-point") : undefined;
  if (!entry) {
    throw new AggregateError(result.logs, `[bractjs] could not build CSS module ${real}`);
  }
  // A tiny ESM module: `var x_default = { card: "card_DnIJww" }; export { x_default as default };`
  return entry.text();
}

function realpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
