import { describe, expect, test } from "bun:test";
import { handleActionRequest } from "../server/action-handler.ts";
import { resolveAction } from "../server/action-registry.ts";

// ── handleActionRequest routing guards ────────────────────────────────────

describe("handleActionRequest — routing", () => {
  test("returns null for non-/_action paths", async () => {
    const req = new Request("http://localhost/about", { method: "POST" });
    const result = await handleActionRequest(req);
    expect(result).toBeNull();
  });

  test("returns null for / path (no /_action prefix)", async () => {
    const req = new Request("http://localhost/", { method: "POST" });
    expect(await handleActionRequest(req)).toBeNull();
  });

  test("returns 405 for GET to /_action", async () => {
    const req = new Request("http://localhost/_action?id=abc", { method: "GET" });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(405);
  });

  test("returns 400 when id query param is missing", async () => {
    const req = new Request("http://localhost/_action", {
      method: "POST",
      headers: { "X-BractJS-Action": "1" },
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(400);
  });

  test("returns 404 for unknown action id", async () => {
    const req = new Request("http://localhost/_action?id=does-not-exist-xyz", {
      method: "POST",
      headers: { "X-BractJS-Action": "1" },
    });
    const res = await handleActionRequest(req);
    expect(res?.status).toBe(404);
  });
});

// ── resolveAction ──────────────────────────────────────────────────────────

describe("resolveAction", () => {
  test("returns null for unknown ids", () => {
    expect(resolveAction("nonexistent-id-xyz")).toBeNull();
    expect(resolveAction("")).toBeNull();
    expect(resolveAction("00000000")).toBeNull();
  });
});
