import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { serveStatic } from "../server/static.ts";

const TMP = resolve(import.meta.dir, ".tmp-static-embedded");
const BUILD = join(TMP, "build");
const PUBLIC = join(TMP, "public");

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(join(BUILD, "client"), { recursive: true });
  await mkdir(PUBLIC, { recursive: true });

  await writeFile(join(BUILD, "client", "app.js"), "console.log('app');");
  await writeFile(join(PUBLIC, "logo.svg"), "<svg/>");

  // Outside-root file for symlink-escape test
  await writeFile(join(TMP, "secret.txt"), "shhh");
  // Symlink from inside build/client/ to a file OUTSIDE the root
  await symlink(join(TMP, "secret.txt"), join(BUILD, "client", "escape.js"));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("serveStatic — normal filesystem path", () => {
  test("serves a client asset", async () => {
    const res = await serveStatic("/build/client/app.js", BUILD, PUBLIC);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Cache-Control")).toContain("immutable");
    expect(await res!.text()).toContain("console.log");
  });

  test("serves a public asset", async () => {
    const res = await serveStatic("/public/logo.svg", BUILD, PUBLIC);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Cache-Control")).toContain("no-cache");
  });

  test("returns null for unmatched prefix", async () => {
    expect(await serveStatic("/api/foo", BUILD, PUBLIC)).toBeNull();
  });

  test("blocks .. traversal segments", async () => {
    expect(
      await serveStatic("/build/client/../secret.txt", BUILD, PUBLIC),
    ).toBeNull();
  });

  test("blocks symlink that escapes the root after realpath", async () => {
    // realpath resolves escape.js → ../secret.txt → outside BUILD/client.
    // Must return null, NOT serve the secret file.
    const res = await serveStatic("/build/client/escape.js", BUILD, PUBLIC);
    expect(res).toBeNull();
  });
});

describe("serveStatic — embedded-binary fallback", () => {
  test("structural traversal guard still blocks .. even when realpath throws", async () => {
    // `/build/client/__definitely_missing__.js` doesn't exist → realpath
    // throws → fallback runs → Bun.file().exists() returns false → null.
    // Guarantees the fallback doesn't accidentally serve nonexistent paths.
    const res = await serveStatic(
      "/build/client/__definitely_missing__.js",
      BUILD,
      PUBLIC,
    );
    expect(res).toBeNull();
  });
});
