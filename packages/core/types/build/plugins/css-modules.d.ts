import type { BunPlugin } from "bun";
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
export declare const cssModulesPlugin: BunPlugin;
/**
 * Transform a CSS module file and return { map, css }.
 * Used by the dev server to inject styles via HMR WebSocket.
 */
export declare function transformCssModule(filePath: string): Promise<{
    map: Record<string, string>;
    css: string;
}>;
