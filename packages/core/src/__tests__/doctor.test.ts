import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  checkAppLayout,
  checkBunVersion,
  checkConfig,
  checkPort,
  checkReactCopies,
  formatDoctor,
} from "../cli/doctor.ts";

describe("bractjs doctor checks", () => {
  test("Bun version against the supported floor", () => {
    expect(checkBunVersion("1.4.2", "1.4.2").status).toBe("ok");
    expect(checkBunVersion("1.5.0", "1.4.2").status).toBe("ok");
    const old = checkBunVersion("1.3.14", "1.4.2");
    expect(old.status).toBe("fail");
    expect(old.fix).toBe("bun upgrade");
  });

  describe("app layout", () => {
    const TMP = resolve(import.meta.dir, ".tmp-doctor");
    beforeAll(async () => {
      await rm(TMP, { recursive: true, force: true });
      await mkdir(resolve(TMP, "app"), { recursive: true });
    });
    afterAll(async () => {
      await rm(TMP, { recursive: true, force: true });
    });

    test("a missing app directory fails", () => {
      expect(checkAppLayout("./nope", TMP)).toMatchObject({ status: "fail", detail: "./nope doesn't exist" });
    });

    test("an app without root.tsx or routes/ fails", () => {
      expect(checkAppLayout("./app", TMP)).toMatchObject({
        status: "fail",
        detail: "./app has no root.tsx or routes/",
      });
    });
  });

  test("one copy of React in this workspace", () => {
    const result = checkReactCopies(resolve(import.meta.dir, "../.."));
    expect(result.status).toBe("ok");
    expect(result.detail).toMatch(/^one copy, react and react-dom \d+\.\d+\.\d+$/);
  });

  test("a config that fails to load fails the check", async () => {
    const result = await checkConfig(async () => {
      throw new Error('bractjs.config: "port" must be a finite number');
    });
    expect(result).toMatchObject({
      status: "fail",
      detail: 'bractjs.config: "port" must be a finite number',
    });
  });

  test("a port in use warns", async () => {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    try {
      expect((await checkPort(server.port as number)).status).toBe("warn");
    } finally {
      server.stop(true);
    }
  });

  test("the report: icons, fixes for problems, a summary", () => {
    const out = formatDoctor([
      { name: "Bun version", status: "ok", detail: "Bun 1.4.2" },
      { name: "Port", status: "warn", detail: "3000 is in use", fix: "pick another" },
      { name: "React", status: "fail", detail: "two copies", fix: "dedupe" },
    ]);
    expect(out).toContain("  ✓ Bun version  Bun 1.4.2");
    expect(out).toContain("  ! Port         3000 is in use\n    → pick another");
    expect(out).toContain("  ✗ React        two copies\n    → dedupe");
    expect(out).toEndWith("1 problem, 1 warning.");
  });
});
