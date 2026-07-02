import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "../index.ts";

// The published type surface (`types/*.d.ts`) is hand-maintained, not
// generated. These tests keep it in lockstep with the runtime barrel
// (`src/index.ts`): a runtime export missing from the declarations is
// invisible to TypeScript consumers, and a declared value that doesn't exist
// at runtime is a lie that compiles and then crashes.

const typesDir = join(import.meta.dir, "../../types");

function readAllDeclarations(): string {
  return readdirSync(typesDir)
    .filter((f) => f.endsWith(".d.ts"))
    .map((f) => readFileSync(join(typesDir, f), "utf8"))
    .join("\n");
}

/** Names declared as VALUES (function/const/class/let/var) in the .d.ts files. */
function declaredValueNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/^export declare (?:async )?(?:function|const|class|let|var)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  return names;
}

/** Every exported name (values, interfaces, type aliases, re-export lists). */
function declaredNames(src: string): Set<string> {
  const names = declaredValueNames(src);
  for (const m of src.matchAll(/^export (?:interface|type)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  // `export { A, B as C } from "..."` / `export type { ... }` — lists can span lines.
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim();
      if (!name) continue;
      const asMatch = name.match(/^\w+\s+as\s+(\w+)$/);
      names.add(asMatch ? asMatch[1] : name.split(/\s/)[0]);
    }
  }
  return names;
}

describe("type surface (types/*.d.ts vs src/index.ts)", () => {
  const allDecls = readAllDeclarations();
  const declared = declaredNames(allDecls);
  const runtimeNames = Object.keys(api).sort();

  test("every runtime export is declared in types/", () => {
    const missing = runtimeNames.filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  test("every value declared in types/index.d.ts exists at runtime", () => {
    // Only index.d.ts value declarations are the public entry's surface; the
    // sibling .d.ts files also back re-exports, so index.d.ts is the contract.
    const indexDecls = readFileSync(join(typesDir, "index.d.ts"), "utf8");
    const phantom = [...declaredValueNames(indexDecls)].filter(
      (name) => !(name in api),
    );
    expect(phantom).toEqual([]);
  });
});
