import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useClientStubPlugin, useServerProxyPlugin } from "../build/directives.ts";

let dir = "";

beforeAll(async () => {
  dir = join(tmpdir(), `bract-directives-${Date.now()}`);
  await mkdir(dir, { recursive: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function runBundle(entry: string, plugin: typeof useClientStubPlugin): Promise<string> {
  const out = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    plugins: [plugin],
  });
  if (!out.success) throw new Error(out.logs.join("\n"));
  return await out.outputs[0].text();
}

describe("directives — BOM-prefixed 'use server'", () => {
  test("BOM + 'use server' still detected → exports replaced with fetch proxy", async () => {
    const file = join(dir, "bom-server.ts");
    await writeFile(file, '﻿"use server";\nexport async function ping(x) { return x; }\n');
    const code = await runBundle(file, useServerProxyPlugin);
    // The proxy helper is inlined when directive is detected.
    expect(code).toContain("__bract");
    expect(code).toContain("/_action?id=");
  });

  test("BOM + 'use client' detected → exports replaced with null stubs", async () => {
    const file = join(dir, "bom-client.tsx");
    await writeFile(file, '﻿"use client";\nexport const Widget = () => null;\n');
    const code = await runBundle(file, useClientStubPlugin);
    expect(code).toMatch(/Widget\s*=\s*\(\)\s*=>\s*null/);
  });

  test("leading whitespace + 'use server' still detected", async () => {
    const file = join(dir, "ws-server.ts");
    await writeFile(file, '   \n\t"use server";\nexport async function pong() { return 1; }\n');
    const code = await runBundle(file, useServerProxyPlugin);
    expect(code).toContain("__bract");
  });
});
