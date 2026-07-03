import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "../server/serve.ts";

// PARITY CONTRACT between the document (full-page GET) branch and the /_data
// (soft-navigation JSON) branch of the request handler. The two branches
// currently duplicate the auth → middleware → loader → headers pipeline in
// src/server/request-handler.ts; any refactor that unifies them must keep
// every pair of assertions below agreeing. Individual behaviors are covered
// elsewhere (integration/security/headers tests) — this file exists to pin the
// EQUIVALENCE of the two paths, not the behaviors themselves.

const PORT = 4390;
const BASE = `http://localhost:${PORT}`;
const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

let handle: ReturnType<typeof createServer>;

beforeAll(() => {
  handle = createServer({
    port: PORT,
    appDir: FIXTURE_APP,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });
});

afterAll(() => {
  handle.stop();
});

describe("document vs /_data parity", () => {
  test("beforeLoad short-circuit blocks BOTH paths with the same status", async () => {
    const doc = await fetch(`${BASE}/protected`);
    const data = await fetch(`${BASE}/_data?path=/protected`);
    expect(doc.status).toBe(403);
    expect(data.status).toBe(403);
  });

  test("a beforeLoad-gated loader's data leaks through NEITHER path", async () => {
    const doc = await (await fetch(`${BASE}/protected`)).text();
    const data = await (await fetch(`${BASE}/_data?path=/protected`)).text();
    expect(doc).not.toContain("TOP-SECRET-LOADER-DATA");
    expect(data).not.toContain("TOP-SECRET-LOADER-DATA");
  });

  test("route middleware runs on BOTH paths (response header stamped)", async () => {
    const doc = await fetch(`${BASE}/features-demo`);
    const data = await fetch(`${BASE}/_data?path=/features-demo`);
    expect(doc.headers.get("X-Demo-Mw")).toBe("1");
    expect(data.headers.get("X-Demo-Mw")).toBe("1");
  });

  test("middleware-written context reaches the loader on BOTH paths", async () => {
    const doc = await (await fetch(`${BASE}/features-demo`)).text();
    const dataRes = await fetch(`${BASE}/_data?path=/features-demo`);
    const data = (await dataRes.json()) as { route?: { user?: string } };
    expect(doc).toContain("alice");
    expect(data.route?.user).toBe("alice");
  });

  test("headers() export applies to BOTH paths with the same value", async () => {
    const doc = await fetch(`${BASE}/features-demo`);
    const data = await fetch(`${BASE}/_data?path=/features-demo`);
    expect(doc.headers.get("Cache-Control")).toBe("public, max-age=120");
    expect(data.headers.get("Cache-Control")).toBe("public, max-age=120");
  });

  test("an unknown path 404s on BOTH paths", async () => {
    const doc = await fetch(`${BASE}/definitely-missing`);
    const data = await fetch(`${BASE}/_data?path=/definitely-missing`);
    expect(doc.status).toBe(404);
    expect(data.status).toBe(404);
  });
});
