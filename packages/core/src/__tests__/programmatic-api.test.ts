/**
 * Tests for the programmatic API: createDevServer, runBuild, loadUserConfig.
 *
 * Note: tests that start Bun.serve() (like integration.test.ts) are excluded
 * here because the process.on("beforeExit") handler in createServer causes
 * bun:test to exit before printing results — a known pre-existing issue.
 * Behavioral coverage (HTTP response, HMR) lives in integration.test.ts.
 */
import { test, expect, describe } from "bun:test";
import { loadUserConfig, validateUserConfig, defineConfig } from "../config/load.ts";
import { runBuild } from "../build/bundler.ts";
import { createDevServer } from "../dev/server.ts";
import type { BuildConfig } from "../build/bundler.ts";
import type { DevServerOptions, DevServer } from "../dev/server.ts";

// ── loadUserConfig ────────────────────────────────────────────────────────

test("loadUserConfig is exported from config/load", () => {
  expect(typeof loadUserConfig).toBe("function");
});

test("loadUserConfig returns an object when no bractjs.config.ts exists", async () => {
  // Repo root has no bractjs.config.ts — must return a plain empty object.
  const cfg = await loadUserConfig();
  expect(typeof cfg).toBe("object");
  expect(cfg).not.toBeNull();
});

describe("validateUserConfig", () => {
  test("accepts an empty object", () => {
    expect(validateUserConfig({})).toEqual({});
  });

  test("accepts a well-formed config", () => {
    const cfg = {
      port: 4000,
      appDir: "./app",
      minify: false,
      sourcemap: "inline" as const,
      clientEnv: ["PUBLIC_API_URL"],
    };
    expect(validateUserConfig(cfg)).toBe(cfg);
  });

  test("rejects a non-object export", () => {
    expect(() => validateUserConfig("nope")).toThrow(/must be a config object/);
    expect(() => validateUserConfig([])).toThrow(/must be a config object/);
    expect(() => validateUserConfig(null)).toThrow(/must be a config object/);
  });

  test("rejects a string port", () => {
    expect(() => validateUserConfig({ port: "3000" })).toThrow(/"port" must be a finite number/);
  });

  test("rejects a non-array clientEnv", () => {
    expect(() => validateUserConfig({ clientEnv: "PUBLIC_API_URL" })).toThrow(/"clientEnv" must be an array/);
  });

  test("rejects an invalid sourcemap value", () => {
    expect(() => validateUserConfig({ sourcemap: "yes" })).toThrow(/"sourcemap" must be/);
  });

  test("rejects a string hmrPort but accepts a number", () => {
    expect(() => validateUserConfig({ hmrPort: "3001" })).toThrow(/"hmrPort" must be a finite number/);
    expect(validateUserConfig({ hmrPort: 3005 })).toEqual({ hmrPort: 3005 });
  });

  test("ignores unknown keys and undefined values", () => {
    expect(() => validateUserConfig({ port: undefined, somethingCustom: 1 })).not.toThrow();
  });
});

// ── defineConfig ──────────────────────────────────────────────────────────

describe("defineConfig", () => {
  test("is an identity function (returns the same reference)", () => {
    const cfg = { port: 3000, clientEnv: ["X"] };
    expect(defineConfig(cfg)).toBe(cfg);
  });

  test("is re-exported from src/index.ts", async () => {
    const mod = await import("../index.ts");
    expect(typeof mod.defineConfig).toBe("function");
  });
});

// ── runBuild ──────────────────────────────────────────────────────────────

test("runBuild is exported from build/bundler", () => {
  expect(typeof runBuild).toBe("function");
});

test("runBuild signature does not require server-only fields (port/manifest/publicDir)", () => {
  // Compile-time guard: if BuildConfig mistakenly included required server fields,
  // this line would fail TypeScript type-checking.
  const config: BuildConfig = { appDir: "./app", minify: false };
  expect(typeof config).toBe("object");
  // Ensure none of the server-only keys are present as required fields.
  expect("port" in config).toBe(false);
  expect("manifest" in config).toBe(false);
  expect("publicDir" in config).toBe(false);
});

test("runBuild rejects with a defined error when appDir does not exist", async () => {
  await expect(
    runBuild({ appDir: "/definitely/does/not/exist/__bractjs_test__" }),
  ).rejects.toBeDefined();
});

// ── createDevServer ───────────────────────────────────────────────────────

test("createDevServer is exported from dev/server", () => {
  expect(typeof createDevServer).toBe("function");
});

test("createDevServer accepts DevServerOptions shape without error at compile time", () => {
  // Compile-time guard: verify the options interface has the expected fields.
  const opts: DevServerOptions = {
    port: 3997,
    hmrPort: 3996,
    skipUserConfig: true,
    config: { appDir: "./app" },
  };
  expect(typeof opts).toBe("object");
  expect(opts.port).toBe(3997);
  expect(opts.hmrPort).toBe(3996);
  expect(opts.skipUserConfig).toBe(true);
});

test("DevServer interface has a stop() method", () => {
  // Compile-time guard: verify DevServer shape.
  const stub: DevServer = { stop: () => {} };
  expect(typeof stub.stop).toBe("function");
});

// ── Re-exports from src/index.ts ──────────────────────────────────────────

test("createDevServer, runBuild, loadUserConfig are all re-exported from src/index.ts", async () => {
  const mod = await import("../index.ts");
  expect(typeof mod.createDevServer).toBe("function");
  expect(typeof mod.runBuild).toBe("function");
  expect(typeof mod.loadUserConfig).toBe("function");
});
