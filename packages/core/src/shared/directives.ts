// Single source of truth for detecting `"use server"` / `"use client"` module
// directives. Three subsystems must agree on this test or a module drifts into
// a dangerous state: the runtime action registry (publishes RPC endpoints),
// the module-registry codegen (static imports for compiled binaries), and the
// build plugins (client-bundle proxying / server-bundle stubbing). A module
// detected by one but not another either leaks server source to the browser
// or silently 404s its actions.
//
// The regexes are anchored to the START OF FILE and skip only whitespace and
// line/block comments before the directive, per the ECMAScript directive
// prologue. `\s` matches U+FEFF, so a UTF-8 BOM is tolerated. Never add the
// `m` flag: `^` would then match any line start, so a `"use server"` string
// sitting on its own line mid-file (e.g. inside a template literal) would flip
// the whole module.

const SERVER_RE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;
const CLIENT_RE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;

/** True when the module opens with a `"use server"` directive prologue. */
export function hasServerDirective(src: string): boolean {
  return SERVER_RE.test(src);
}

/** True when the module opens with a `"use client"` directive prologue. */
export function hasClientDirective(src: string): boolean {
  return CLIENT_RE.test(src);
}
