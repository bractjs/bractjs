import { describe, expect, test } from "bun:test";
import { extractApiRouteDefs, lintRouteModuleSource } from "../build/route-lint.ts";

describe("lintRouteModuleSource — empty routes", () => {
  test("warns when a route has no meaningful export", () => {
    const w = lintRouteModuleSource(`export const meta = () => [];\n`, "routes/empty.tsx");
    expect(w.some((m) => /renders an empty page/.test(m))).toBe(true);
  });

  test("loader-only is fine (data route)", () => {
    const w = lintRouteModuleSource(`export function loader() { return {}; }\n`, "routes/data.tsx");
    expect(w).toEqual([]);
  });

  test("beforeLoad-only is fine (redirect/guard route)", () => {
    const w = lintRouteModuleSource(`export function beforeLoad() {}\n`, "routes/guard.tsx");
    expect(w).toEqual([]);
  });

  test("named default is fine", () => {
    const w = lintRouteModuleSource(`export default function Page() { return null; }\n`, "routes/p.tsx");
    expect(w).toEqual([]);
  });

  test("anonymous arrow default is recognized as a component", () => {
    const w = lintRouteModuleSource(`export default () => null;\n`, "routes/anon.tsx");
    expect(w).toEqual([]);
  });

  test("anonymous function default is recognized", () => {
    const w = lintRouteModuleSource(`export default function () { return null; }\n`, "routes/anon2.tsx");
    expect(w).toEqual([]);
  });
});

describe("lintRouteModuleSource — miscased exports", () => {
  test('"Loader" is flagged as a near-miss of "loader"', () => {
    const w = lintRouteModuleSource(
      `export default () => null;\nexport function Loader() { return {}; }\n`,
      "routes/x.tsx",
    );
    expect(w.some((m) => /"Loader" looks like "loader"/.test(m))).toBe(true);
  });

  test('"fallback" → "Fallback", "beforeload" → "beforeLoad"', () => {
    const w = lintRouteModuleSource(
      `export default () => null;\n` +
        `export const fallback = () => null;\n` +
        `export function beforeload() {}\n`,
      "routes/y.tsx",
    );
    expect(w.some((m) => /"fallback" looks like "Fallback"/.test(m))).toBe(true);
    expect(w.some((m) => /"beforeload" looks like "beforeLoad"/.test(m))).toBe(true);
  });

  test("exact canonical names produce no near-miss warnings", () => {
    const src =
      `export default () => null;\n` +
      `export function loader() { return {}; }\n` +
      `export function action() { return {}; }\n` +
      `export const clientLoader = () => ({});\n` +
      `export const clientAction = () => ({});\n` +
      `export function headers() { return {}; }\n` +
      `export const middleware = [];\n` +
      `export const handle = {};\n` +
      `export const searchSchema = {};\n` +
      `export function Fallback() { return null; }\n` +
      `export const ssr = false;\n`;
    expect(lintRouteModuleSource(src, "routes/z.tsx")).toEqual([]);
  });

  test("unrelated exports are not flagged", () => {
    const w = lintRouteModuleSource(
      `export default () => null;\nexport const helper = 1;\nexport type Foo = string;\n`,
      "routes/h.tsx",
    );
    expect(w).toEqual([]);
  });
});

describe("extractApiRouteDefs", () => {
  test("finds route() calls with method and path", () => {
    const src =
      `import { route } from "@bractjs/bractjs";\n` +
      `export const getUsers = route("GET", "/api/users", async () => []);\n` +
      `export const addUser = route("POST", "/api/users", async (input) => input, { csrf: true });\n`;
    expect(extractApiRouteDefs(src)).toEqual([
      { method: "GET", path: "/api/users" },
      { method: "POST", path: "/api/users" },
    ]);
  });

  test("finds namespace-style bract.route() calls and single quotes", () => {
    const src = `export const del = bract.route('DELETE', '/api/items/:id', handler);\n`;
    expect(extractApiRouteDefs(src)).toEqual([{ method: "DELETE", path: "/api/items/:id" }]);
  });

  test("tolerates a line break between method and path", () => {
    const src = `export const r = route(\n  "PUT",\n  "/api/settings",\n  handler,\n);\n`;
    expect(extractApiRouteDefs(src)).toEqual([{ method: "PUT", path: "/api/settings" }]);
  });

  test("ignores modules without route definitions", () => {
    expect(extractApiRouteDefs(`export const route = "/somewhere";\n`)).toEqual([]);
    expect(extractApiRouteDefs(`navigate(route("home"))\n`)).toEqual([]);
  });
});

describe("lintRouteModuleSource — Remix / React Router exports", () => {
  test("React Router exports BractJS now reads produce no warnings", () => {
    const w = lintRouteModuleSource(
      `export default () => null;\nexport const links = () => [];\nexport function HydrateFallback() { return null; }\nexport const unstable_middleware = [];\n`,
      "routes/ported.tsx",
    );
    expect(w).toEqual([]);
  });

  test("client middleware is still flagged", () => {
    const w = lintRouteModuleSource(
      `export default () => null;\nexport const clientMiddleware = [];\n`,
      "routes/ported.tsx",
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('export "clientMiddleware" is ignored');
  });

  test("native BractJS exports produce no porting warnings", () => {
    const w = lintRouteModuleSource(
      `export default () => null;\nexport const middleware = [];\nexport function Fallback() { return null; }\nexport const ssr = false;\n`,
      "routes/native.tsx",
    );
    expect(w).toEqual([]);
  });
});
