import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as buildApi from "../build-entry.ts";
import * as codegenApi from "../codegen-entry.ts";
import * as rootApi from "../index.ts";

// The published type surface (`types/`) is GENERATED from `src/` by
// `bun run typegen` (tsc --emitDeclarationOnly) and committed. These tests
// catch the cheap-but-common staleness — an export added to or removed from
// an entry barrel without regenerating — without spawning tsc. Signature-level
// drift is caught by CI, which reruns typegen and fails on any diff.

const typesDir = join(import.meta.dir, "../../types");

/**
 * Names in VALUE re-export lists of a generated entry —
 * `export { A, B as C } from "..."`. `export type { ... }` lists and inline
 * `type X` entries are excluded: types have no runtime counterpart.
 */
function valueExports(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(type\s+)?\{([^}]+)\}/g)) {
    if (m[1]) continue; // `export type { ... }` — type-only list
    for (const raw of m[2].split(",")) {
      const entry = raw.trim();
      if (!entry || entry.startsWith("type ")) continue;
      const asMatch = entry.match(/^\w+\s+as\s+(\w+)$/);
      names.add(asMatch ? asMatch[1] : entry.split(/\s/)[0]);
    }
  }
  return names;
}

const entries = [
  { name: ".", dts: "index.d.ts", api: rootApi },
  { name: "./build", dts: "build-entry.d.ts", api: buildApi },
  { name: "./codegen", dts: "codegen-entry.d.ts", api: codegenApi },
] as const;

for (const { name, dts, api } of entries) {
  describe(`type surface of "${name}" (generated types/${dts} vs runtime)`, () => {
    const declared = valueExports(readFileSync(join(typesDir, dts), "utf8"));
    const runtimeNames = Object.keys(api).sort();

    test("every runtime export appears in the generated declarations (rerun `bun run typegen`)", () => {
      const missing = runtimeNames.filter((n) => !declared.has(n));
      expect(missing).toEqual([]);
    });

    test("every declared value export exists at runtime (rerun `bun run typegen`)", () => {
      const phantom = [...declared].filter((n) => !(n in api));
      expect(phantom).toEqual([]);
    });
  });
}
