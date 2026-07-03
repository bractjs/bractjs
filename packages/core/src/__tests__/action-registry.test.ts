import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  loadServerActions,
  loadServerActionsFromRegistry,
  resolveAction,
} from "../server/action-registry.ts";

const TMP = resolve(import.meta.dir, ".tmp-action-registry");

// Mirrors `pathKeyForAction` in src/server/action-registry.ts + src/build/directives.ts.
// Action IDs are SHA-256(appDir-relative path + "#" + name) so the IDs are
// stable across machines and inside a compiled binary.
function pathKey(absPath: string, appDir: string): string {
  const absAppDir = isAbsolute(appDir) ? appDir : resolve(appDir);
  const rel = relative(absAppDir, absPath);
  return rel.startsWith("..") ? absPath : rel;
}

async function computeId(absPath: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(pathKey(absPath, TMP) + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(resolve(TMP, "routes"), { recursive: true });
  await mkdir(resolve(TMP, "lib"), { recursive: true });

  // Eligible: routes/ file with real "use server" directive
  await writeFile(
    resolve(TMP, "routes", "_index.tsx"),
    `"use server";\nexport async function realAction() { return 1; }\n`,
  );

  // Eligible by suffix: .server.ts
  await writeFile(
    resolve(TMP, "lib", "thing.server.ts"),
    `"use server";\nexport async function suffixAction() { return 2; }\n`,
  );

  // Ineligible: arbitrary lib file (no .server suffix, not in routes/)
  await writeFile(
    resolve(TMP, "lib", "helpers.ts"),
    `"use server";\nexport async function shouldNotLoad() { return 3; }\n`,
  );

  // Ineligible: "use server" inside a template literal (not at start-of-file)
  await writeFile(
    resolve(TMP, "routes", "fake.tsx"),
    `const s = \`use server\`;\nexport async function notADirective() { return 4; }\n`,
  );

  await loadServerActions(TMP);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("loadServerActions — eligibility", () => {
  test("routes/ file with real directive registers exports", async () => {
    const id = await computeId(resolve(TMP, "routes", "_index.tsx"), "realAction");
    expect(resolveAction(id)).not.toBeNull();
  });

  test(".server.ts file registers exports", async () => {
    const id = await computeId(resolve(TMP, "lib", "thing.server.ts"), "suffixAction");
    expect(resolveAction(id)).not.toBeNull();
  });

  test("ineligible path (lib/*.ts) does NOT register", async () => {
    const id = await computeId(resolve(TMP, "lib", "helpers.ts"), "shouldNotLoad");
    expect(resolveAction(id)).toBeNull();
  });

  test("'use server' inside template literal does NOT register", async () => {
    const id = await computeId(resolve(TMP, "routes", "fake.tsx"), "notADirective");
    expect(resolveAction(id)).toBeNull();
  });
});

describe("loadServerActionsFromRegistry", () => {
  test("statically-imported modules register under SHA-256(relPath#name)", async () => {
    // Action ID must match what the client proxy plugin would emit. The
    // codegen path passes relPath directly (no appDir stripping needed) so
    // the hash input is the literal entry.relPath string.
    async function rawId(relPath: string, name: string): Promise<string> {
      const raw = new TextEncoder().encode(relPath + "#" + name);
      const buf = await crypto.subtle.digest("SHA-256", raw);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    }

    const fakeMod = {
      sendEmail: async (to: string) => `sent ${to}`,
      __ignored: 42, // non-function — must be skipped
    };
    await loadServerActionsFromRegistry([{ relPath: "routes/contact.server.ts", mod: fakeMod }]);
    const id = await rawId("routes/contact.server.ts", "sendEmail");
    const fn = resolveAction(id);
    expect(fn).not.toBeNull();
    expect(await fn!("a@b.com")).toBe("sent a@b.com");

    const ignored = await rawId("routes/contact.server.ts", "__ignored");
    expect(resolveAction(ignored)).toBeNull();
  });
});
