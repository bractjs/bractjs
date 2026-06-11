import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { BunPlugin } from "bun";

// ── Hash helpers ───────────────────────────────────────────────────────────

function hashClassName(filename: string, className: string): string {
  const raw = filename + "#" + className;
  return createHash("sha256").update(raw).digest("hex").slice(0, 8);
}

function scopedName(filename: string, className: string): string {
  const base = basename(filename).replace(/\.module\.css$/, "").replace(/[^A-Za-z0-9_-]/g, "_");
  return `${base}_${className}_${hashClassName(filename, className)}`;
}

// ── CSS class name extractor ───────────────────────────────────────────────

function extractClassNames(css: string): string[] {
  const names: string[] = [];
  // Match simple class selectors: .className { ... }
  // Does not handle :local() or @keyframes — CSS Modules basic subset.
  const re = /\.([A-Za-z_][A-Za-z0-9_-]*)\s*[{,:\s]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

// ── Replacer ───────────────────────────────────────────────────────────────

function transformCss(css: string, filePath: string, map: Record<string, string>): string {
  // Replace each .className with .hashedName in the CSS source.
  return css.replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (match, name: string) => {
    return map[name] ? "." + map[name] : match;
  });
}

// ── Bun plugin ────────────────────────────────────────────────────────────

/**
 * A Bun.build() plugin that handles `*.module.css` imports.
 *
 * At build time:
 * 1. Reads the CSS file.
 * 2. Extracts class names and hashes them: `${filename}_${className}_${hash8}`.
 * 3. Returns a JS module that exports the class name mapping object.
 * 4. Emits the transformed CSS as a side-effect (injected via a <link> tag at runtime,
 *    or via HMR <style> injection in dev).
 *
 * Usage in bractjs config:
 *   import { cssModulesPlugin } from 'bractjs/build/plugins/css-modules';
 *   Bun.build({ plugins: [cssModulesPlugin] })
 */
export const cssModulesPlugin: BunPlugin = {
  name: "bractjs-css-modules",
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      const css = await readFile(args.path, "utf-8");
      const classNames = extractClassNames(css);

      const map: Record<string, string> = {};
      for (const name of classNames) {
        map[name] = scopedName(args.path, name);
      }

      const transformed = transformCss(css, args.path, map);

      // Emit the transformed CSS as a JS-injected style block.
      // In prod builds a separate CSS file is preferred; here we inline via JS
      // so the plugin works without a separate CSS pipeline step.
      const cssEscape = JSON.stringify(transformed);
      const mapLiteral = JSON.stringify(map);

      const code = `
if (typeof document !== 'undefined') {
  const existing = document.getElementById(${JSON.stringify("bract-css-" + hashClassName(args.path, "__module__"))});
  if (!existing) {
    const style = document.createElement('style');
    style.id = ${JSON.stringify("bract-css-" + hashClassName(args.path, "__module__"))};
    style.textContent = ${cssEscape};
    document.head.appendChild(style);
  }
}
export default ${mapLiteral};
`;
      return { contents: code, loader: "js" };
    });
  },
};

// ── Dev HMR injection (used by hmr-server) ───────────────────────────────

/**
 * Transform a CSS module file and return { map, css }.
 * Used by the dev server to inject styles via HMR WebSocket.
 */
export async function transformCssModule(
  filePath: string,
): Promise<{ map: Record<string, string>; css: string }> {
  const css = await readFile(filePath, "utf-8");
  const classNames = extractClassNames(css);
  const map: Record<string, string> = {};
  for (const name of classNames) {
    map[name] = scopedName(filePath, name);
  }
  return { map, css: transformCss(css, filePath, map) };
}
