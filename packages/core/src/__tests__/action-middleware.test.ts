// Route middleware for "use server" actions: the chain comes from where the
// action is defined (routes/** → root, layouts, its module; elsewhere → root),
// on /_action and /_stream alike.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createTestApp, type TestApp } from "../testing-entry.ts";

const TMP = resolve(import.meta.dir, ".tmp-action-middleware");
const SRC = resolve(import.meta.dir, "..");

declare global {
  var __actionChain: string[];
}

async function actionId(relPath: string, name: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${relPath}#${name}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// Each middleware records its name; a request header lets a test make one deny.
const MW = `
import { redirect } from "${SRC}/server/response.ts";
export const mark = (name) => async ({ request }, next) => {
  globalThis.__actionChain.push(name);
  if (request.headers.get("X-Deny") === name) return new Response("denied by " + name, { status: 401 });
  if (request.headers.get("X-Redirect") === name) return redirect("/login");
  if (request.headers.get("X-Throw-Redirect") === name) throw redirect("/login");
  return next();
};
`;

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(resolve(TMP, "routes/admin"), { recursive: true });
  await mkdir(resolve(TMP, "lib"), { recursive: true });
  await writeFile(resolve(TMP, "lib/mw.ts"), MW);
  await writeFile(
    resolve(TMP, "root.tsx"),
    `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
import { mark } from "./lib/mw.ts";
export const middleware = [mark("root")];
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
  );
  await writeFile(
    resolve(TMP, "routes/admin/layout.tsx"),
    `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
import { mark } from "../../lib/mw.ts";
export const middleware = [mark("admin-layout")];
export default function AdminLayout() { return <Outlet />; }
`,
  );
  await writeFile(
    resolve(TMP, "routes/admin/actions.ts"),
    `"use server";
import { mark } from "../../lib/mw.ts";
export const middleware = [mark("actions-module")];
export async function save(x) { globalThis.__actionChain.push("action"); return { saved: x }; }
export async function* feed() { globalThis.__actionChain.push("action"); yield 1; }
`,
  );
  await writeFile(
    resolve(TMP, "lib/open.server.ts"),
    `"use server";
import { withMiddleware } from "${SRC}/index.ts";
import { mark } from "./mw.ts";
export async function ping() { globalThis.__actionChain.push("action"); return "pong"; }
export const guarded = withMiddleware([mark("own")], async () => {
  globalThis.__actionChain.push("action");
  return "ok";
});
`,
  );
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

beforeEach(() => {
  globalThis.__actionChain = [];
});

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({ appDir: TMP, serverEntry: false });
});

async function callAction(
  relPath: string,
  name: string,
  args: unknown[],
  headers: Record<string, string> = {},
) {
  return app.fetch(`/_action?id=${await actionId(relPath, name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BractJS-Action": "1", ...headers },
    body: JSON.stringify(args),
  });
}

describe("route middleware for /_action", () => {
  test("an action under routes/ runs root → layouts → its module's middleware", async () => {
    const res = await callAction("routes/admin/actions.ts", "save", ["draft"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: "draft" });
    expect(globalThis.__actionChain).toEqual(["root", "admin-layout", "actions-module", "action"]);
  });

  test("a layout's middleware can reject the call before the action runs", async () => {
    const res = await callAction("routes/admin/actions.ts", "save", ["x"], { "X-Deny": "admin-layout" });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("denied by admin-layout");
    expect(globalThis.__actionChain).toEqual(["root", "admin-layout"]);
  });

  test("a returned redirect becomes the client envelope", async () => {
    const res = await callAction("routes/admin/actions.ts", "save", ["x"], { "X-Redirect": "admin-layout" });
    expect(res.status).toBe(204);
    expect(res.headers.get("X-BractJS-Redirect")).toBe("/login");
  });

  test("a thrown redirect becomes the client envelope", async () => {
    const res = await callAction("routes/admin/actions.ts", "save", ["x"], { "X-Throw-Redirect": "root" });
    expect(res.status).toBe(204);
    expect(res.headers.get("X-BractJS-Redirect")).toBe("/login");
    expect(globalThis.__actionChain).toEqual(["root"]);
  });

  test("an action outside routes/ runs root's middleware only", async () => {
    const res = await callAction("lib/open.server.ts", "ping", []);
    expect(await res.json()).toBe("pong");
    expect(globalThis.__actionChain).toEqual(["root", "action"]);
  });

  test("withMiddleware() adds the action's own middleware after the route chain", async () => {
    const res = await callAction("lib/open.server.ts", "guarded", []);
    expect(await res.json()).toBe("ok");
    expect(globalThis.__actionChain).toEqual(["root", "own", "action"]);

    globalThis.__actionChain = [];
    const denied = await callAction("lib/open.server.ts", "guarded", [], { "X-Deny": "own" });
    expect(denied.status).toBe(401);
    expect(globalThis.__actionChain).toEqual(["root", "own"]);
  });

  test("the referring page can't change the chain", async () => {
    // Claiming to come from a public page doesn't skip the admin guard.
    const res = await callAction("routes/admin/actions.ts", "save", ["x"], {
      "X-Deny": "admin-layout",
      Referer: "http://localhost/",
    });
    expect(res.status).toBe(401);
  });

  test("the CSRF gate still runs first", async () => {
    const res = await callAction("routes/admin/actions.ts", "save", ["x"], {
      "Sec-Fetch-Site": "cross-site",
    });
    expect(res.status).toBe(403);
    expect(globalThis.__actionChain).toEqual([]);
  });
});

describe("route middleware for /_stream", () => {
  async function stream(headers: Record<string, string> = {}) {
    return app.fetch(`/_stream?id=${await actionId("routes/admin/actions.ts", "feed")}`, {
      headers: { "X-BractJS-Action": "1", ...headers },
    });
  }

  test("runs the same chain before the stream opens", async () => {
    const res = await stream();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("event: done");
    expect(globalThis.__actionChain).toEqual(["root", "admin-layout", "actions-module", "action"]);
  });

  test("a rejection is the response, and the generator never starts", async () => {
    const res = await stream({ "X-Deny": "admin-layout" });
    expect(res.status).toBe(401);
    expect(globalThis.__actionChain).toEqual(["root", "admin-layout"]);
  });
});

describe("actionMiddleware: false", () => {
  test("restores global-middleware-only actions", async () => {
    const legacy = await createTestApp({ appDir: TMP, serverEntry: false, actionMiddleware: false });
    const res = await legacy.fetch(`/_action?id=${await actionId("routes/admin/actions.ts", "save")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1", "X-Deny": "admin-layout" },
      body: JSON.stringify(["x"]),
    });
    expect(res.status).toBe(200);
    expect(globalThis.__actionChain).toEqual(["action"]);
  });
});

describe("registry mode (compiled binary)", () => {
  test("resolves the chain from the module registry, without the filesystem", async () => {
    const { buildFetchHandler } = await import("../server/serve.ts");
    const mod = async (rel: string) => (await import(resolve(TMP, rel))) as Record<string, unknown>;
    const handler = buildFetchHandler({
      appDir: "/nonexistent-app-dir",
      manifest: { clientEntry: "/build/client/client.js", routes: {} },
      routeFiles: [],
      moduleRegistry: {
        "root.tsx": await mod("root.tsx"),
        "routes/admin/layout.tsx": await mod("routes/admin/layout.tsx"),
      },
      actionModules: [{ relPath: "routes/admin/actions.ts", mod: await mod("routes/admin/actions.ts") }],
    });
    const res = await handler(
      new Request(`http://localhost/_action?id=${await actionId("routes/admin/actions.ts", "save")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BractJS-Action": "1", "X-Deny": "admin-layout" },
        body: JSON.stringify(["x"]),
      }),
    );
    expect(res.status).toBe(401);
    expect(globalThis.__actionChain).toEqual(["root", "admin-layout"]);
  });
});
