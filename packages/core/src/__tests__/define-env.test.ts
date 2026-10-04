import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateRouteRegistry } from "../codegen/module-registry.ts";
import { defineEnv, env, EnvError, getPublicEnv } from "../shared/define-env.ts";
import { createTestApp } from "../testing-entry.ts";

const SRC = resolve(import.meta.dir, "..");

describe("defineEnv on the server", () => {
  test("parses and types every variable", () => {
    const values = defineEnv(
      {
        server: {
          DATABASE_URL: env.url({ protocols: ["postgres:"] }),
          PORT: env.number({ integer: true, min: 1, max: 65535 }).default(3000),
          DEBUG: env.boolean().default(false),
          LOG_LEVEL: env.enum(["debug", "info", "warn"]).default("info"),
          SENTRY_DSN: env.string().optional(),
        },
        client: { PUBLIC_API_URL: env.url() },
      },
      {
        source: {
          DATABASE_URL: "postgres://db/app",
          PORT: "8080",
          DEBUG: "yes",
          PUBLIC_API_URL: "https://api.example.com",
          SENTRY_DSN: "",
        },
      },
    );
    expect(values).toEqual({
      DATABASE_URL: "postgres://db/app",
      PORT: 8080,
      DEBUG: true,
      LOG_LEVEL: "info",
      SENTRY_DSN: undefined,
      PUBLIC_API_URL: "https://api.example.com",
    });
    // Types: compile-time checks.
    const port: number = values.PORT;
    const level: "debug" | "info" | "warn" = values.LOG_LEVEL;
    const dsn: string | undefined = values.SENTRY_DSN;
    expect([port, level, dsn]).toEqual([8080, "info", undefined]);
    expect(Object.isFrozen(values)).toBe(true);
  });

  test("lists every problem at once", () => {
    let caught: unknown;
    try {
      defineEnv(
        {
          server: {
            DATABASE_URL: env.url(),
            SESSION_SECRET: env.string({ minLength: 32 }),
            WORKERS: env.number({ integer: true }),
            MODE: env.enum(["a", "b"]),
          },
        },
        { source: { DATABASE_URL: "not a url", SESSION_SECRET: "short", WORKERS: "2.5", MODE: "c" } },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).issues).toEqual([
      'DATABASE_URL must be an absolute URL, got "not a url"',
      "SESSION_SECRET must be at least 32 characters",
      'WORKERS must be an integer, got "2.5"',
      'MODE must be one of a, b, got "c"',
    ]);
    expect((caught as Error).message).toContain("Invalid environment variables:\n  - DATABASE_URL");
  });

  test("an unset or empty variable is missing", () => {
    expect(() => defineEnv({ server: { A: env.string() } }, { source: { A: "" } })).toThrow(
      "A is required but not set",
    );
  });

  test("accepts Standard Schema and Zod-style schemas", () => {
    const standard = {
      "~standard": {
        validate: (v: unknown) =>
          typeof v === "string" && v.length === 2
            ? { value: v.toUpperCase() }
            : { issues: [{ message: "must be 2 letters" }] },
      },
    };
    const zodLike = {
      safeParse: (v: unknown) =>
        v === "on"
          ? { success: true, data: 1 }
          : { success: false, error: { issues: [{ message: "must be on" }] } },
    };
    expect(
      defineEnv({ server: { REGION: standard, FLAG: zodLike } }, { source: { REGION: "eu", FLAG: "on" } }),
    ).toEqual({
      REGION: "EU",
      FLAG: 1,
    });
    expect(() => defineEnv({ server: { REGION: standard } }, { source: { REGION: "x" } })).toThrow(
      "REGION must be 2 letters",
    );
  });

  test("a name can't be both server and client", () => {
    expect(() => defineEnv({ server: { X: env.string() }, client: { X: env.string() } })).toThrow(
      "X is in both server and client",
    );
  });
});

describe("defineEnv in the browser", () => {
  const g = globalThis as { window?: unknown; document?: unknown };
  afterEach(() => {
    delete g.window;
    delete g.document;
  });

  test("reads the client values from the page payload; server variables throw", () => {
    g.document = {};
    g.window = { __BRACTJS_DATA__: { env: { PUBLIC_URL: "https://x.example" } } };
    const values = defineEnv({
      server: { SECRET: env.string() },
      client: { PUBLIC_URL: env.url(), PUBLIC_N: env.number().default(2) },
    });
    expect(values.PUBLIC_URL).toBe("https://x.example");
    expect(values.PUBLIC_N).toBe(2);
    expect(() => values.SECRET).toThrow("SECRET is a server environment variable");
  });
});

describe("startup and the page payload", () => {
  const TMP = resolve(import.meta.dir, ".tmp-define-env");
  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(resolve(TMP, "routes"), { recursive: true });
    process.env.BRACT_TEST_PUBLIC_NAME = "Runtime Name";
    process.env.BRACT_TEST_SECRET = "s3cret";
    await writeFile(
      resolve(TMP, "env.ts"),
      `import { defineEnv, env } from "${SRC}/index.ts";
export default defineEnv({
  server: { BRACT_TEST_SECRET: env.string() },
  client: { BRACT_TEST_PUBLIC_NAME: env.string() },
});
`,
    );
    await writeFile(
      resolve(TMP, "root.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
import e from "./env.ts";
export default function Root() { return <html><body><h1>{e.BRACT_TEST_PUBLIC_NAME}</h1><Outlet /></body></html>; }
`,
    );
    await writeFile(
      resolve(TMP, "routes/_index.tsx"),
      `export default function Page() { return <p>home</p>; }\n`,
    );
  });
  afterAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    delete process.env.BRACT_TEST_PUBLIC_NAME;
    delete process.env.BRACT_TEST_SECRET;
  });

  test("client values reach the page payload; server values never do", async () => {
    const { loadEnvModule } = await import("../config/server-entry.ts");
    await loadEnvModule(TMP);
    expect(getPublicEnv()?.BRACT_TEST_PUBLIC_NAME).toBe("Runtime Name");
    const app = await createTestApp({ appDir: TMP, serverEntry: false });
    const html = await (await app.get("/")).text();
    expect(html).toContain("<h1>Runtime Name</h1>");
    expect(html).toContain('"env":{');
    expect(html).toContain('"BRACT_TEST_PUBLIC_NAME":"Runtime Name"');
    expect(html).not.toContain("s3cret");
  });

  test("loadEnvModule fails fast on an invalid environment", async () => {
    const BAD = resolve(TMP, "bad");
    await mkdir(BAD, { recursive: true });
    await writeFile(
      resolve(BAD, "env.ts"),
      `import { defineEnv, env } from "${SRC}/index.ts";
export default defineEnv({ server: { BRACT_TEST_DEFINITELY_UNSET: env.url() } });
`,
    );
    const { loadEnvModule } = await import("../config/server-entry.ts");
    await expect(loadEnvModule(BAD)).rejects.toThrow("BRACT_TEST_DEFINITELY_UNSET is required but not set");
  });

  test("the compiled binary's registry imports env.ts first", () => {
    const src = generateRouteRegistry({
      appDir: TMP,
      routes: [],
      layoutRelPaths: [],
      hasRoot: true,
      hasEnv: true,
    });
    const envAt = src.indexOf('import "../env.ts";');
    expect(envAt).toBeGreaterThan(-1);
    expect(envAt).toBeLessThan(src.indexOf('from "../root.tsx"'));
  });
});
