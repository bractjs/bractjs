import { describe, expect, test } from "bun:test";
import { handleStreamRequest } from "../server/stream-handler.ts";

const VALID_ID = "0123456789abcdef"; // 16 lowercase hex chars (passes the id regex)

function streamReq(headers: Record<string, string>, id = VALID_ID): Request {
  return new Request(`http://localhost/_stream?id=${id}`, { method: "GET", headers });
}

describe("handleStreamRequest — CSRF gate", () => {
  test("non-/_stream path returns null (falls through)", async () => {
    const res = await handleStreamRequest(new Request("http://localhost/other"));
    expect(res).toBeNull();
  });

  test("missing X-BractJS-Action → 403 even with a same-origin Origin", async () => {
    const res = await handleStreamRequest(streamReq({ Origin: "http://localhost" }));
    expect(res?.status).toBe(403);
  });

  test("missing X-BractJS-Action → 403 with no headers", async () => {
    const res = await handleStreamRequest(streamReq({}));
    expect(res?.status).toBe(403);
  });

  test("with X-BractJS-Action but unknown id → 404 (passes the gate)", async () => {
    const res = await handleStreamRequest(streamReq({ "X-BractJS-Action": "1" }));
    // Gate passed; unknown action id resolves to 404 (not 403).
    expect(res?.status).toBe(404);
  });

  test("with X-BractJS-Action but malformed id → 400 (passes the gate)", async () => {
    const res = await handleStreamRequest(streamReq({ "X-BractJS-Action": "1" }, "NOT-HEX"));
    expect(res?.status).toBe(400);
  });
});
