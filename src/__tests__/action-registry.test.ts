import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadServerActions, resolveAction } from "../server/action-registry.ts";

const TMP = resolve(import.meta.dir, ".tmp-action-registry");

async function computeId(filePath: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(filePath + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(join(TMP, "routes"), { recursive: true });
  await mkdir(join(TMP, "lib"), { recursive: true });

  // Eligible: routes/ file with real "use server" directive
  await writeFile(
    join(TMP, "routes", "_index.tsx"),
    `"use server";\nexport async function realAction() { return 1; }\n`,
  );

  // Eligible by suffix: .server.ts
  await writeFile(
    join(TMP, "lib", "thing.server.ts"),
    `"use server";\nexport async function suffixAction() { return 2; }\n`,
  );

  // Ineligible: arbitrary lib file (no .server suffix, not in routes/)
  await writeFile(
    join(TMP, "lib", "helpers.ts"),
    `"use server";\nexport async function shouldNotLoad() { return 3; }\n`,
  );

  // Ineligible: "use server" inside a template literal (not at start-of-file)
  await writeFile(
    join(TMP, "routes", "fake.tsx"),
    `const s = \`use server\`;\nexport async function notADirective() { return 4; }\n`,
  );

  await loadServerActions(TMP);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("loadServerActions — eligibility", () => {
  test("routes/ file with real directive registers exports", async () => {
    const id = await computeId(join(TMP, "routes", "_index.tsx"), "realAction");
    expect(resolveAction(id)).not.toBeNull();
  });

  test(".server.ts file registers exports", async () => {
    const id = await computeId(join(TMP, "lib", "thing.server.ts"), "suffixAction");
    expect(resolveAction(id)).not.toBeNull();
  });

  test("ineligible path (lib/*.ts) does NOT register", async () => {
    const id = await computeId(join(TMP, "lib", "helpers.ts"), "shouldNotLoad");
    expect(resolveAction(id)).toBeNull();
  });

  test("'use server' inside template literal does NOT register", async () => {
    const id = await computeId(join(TMP, "routes", "fake.tsx"), "notADirective");
    expect(resolveAction(id)).toBeNull();
  });
});
