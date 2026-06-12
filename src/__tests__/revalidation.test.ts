import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "../server/serve.ts";
import { registerRevalidator, triggerRevalidation } from "../client/revalidation.ts";

// ── Unit: revalidator seam (router ↔ fetcher bridge) ───────────────────────

describe("revalidation seam", () => {
  test("triggerRevalidation forwards info to the registered revalidator", async () => {
    const calls: unknown[] = [];
    registerRevalidator(async (info) => { calls.push(info); });
    await triggerRevalidation({ formMethod: "POST", actionStatus: 200 });
    expect(calls).toEqual([{ formMethod: "POST", actionStatus: 200 }]);
    registerRevalidator(null);
  });

  test("resolves quietly when no router is mounted", async () => {
    registerRevalidator(null);
    await triggerRevalidation({ formMethod: "DELETE" }); // must not throw
  });
});

// ── Integration: the submit → revalidate contract ───────────────────────────
// ClientRouter.submit POSTs with X-BractJS-Action (JSON action reply), then
// refetches /_data. This proves the server side of that contract: the mutation
// changes what the next /_data returns.

const PORT = 3995;
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

describe("mutation → revalidation contract", () => {
  test("action mutates, JSON reply carries actionData, /_data reflects the new state", async () => {
    const before = await (await fetch(`${BASE}/_data?path=/counter`)).json() as { route: { count: number } };

    const post = await fetch(`${BASE}/counter`, {
      method: "POST",
      body: new FormData(),
      headers: { Origin: BASE, "X-BractJS-Action": "1" },
    });
    expect(post.status).toBe(200);
    expect(post.headers.get("content-type")).toContain("json");
    const actionData = (await post.json()) as { ok: boolean; count: number };
    expect(actionData.ok).toBe(true);
    expect(actionData.count).toBe(before.route.count + 1);

    // The revalidation fetch ClientRouter issues after the action:
    const after = await (await fetch(`${BASE}/_data?path=/counter`)).json() as { route: { count: number } };
    expect(after.route.count).toBe(before.route.count + 1);
  });
});
