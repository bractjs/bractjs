import { test, expect, describe } from "bun:test";
import { redirect, json, error } from "../server/response.ts";

describe("redirect", () => {
  test("returns 302 by default with Location header", () => {
    const res = redirect("/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/dashboard");
  });

  test("accepts custom status codes (301, 307, 308)", () => {
    expect(redirect("/old", 301).status).toBe(301);
    expect(redirect("/tmp", 307).status).toBe(307);
    expect(redirect("/perm", 308).status).toBe(308);
  });

  test("body is null", async () => {
    const res = redirect("/");
    expect(await res.text()).toBe("");
  });

  describe("open-redirect guard", () => {
    test("rejects absolute http(s) URLs", () => {
      expect(() => redirect("https://evil.com/")).toThrow();
      expect(() => redirect("http://evil.com")).toThrow();
    });

    test("rejects protocol-relative URLs (//evil.com)", () => {
      expect(() => redirect("//evil.com/path")).toThrow();
    });

    test("rejects backslash protocol-relative variant", () => {
      expect(() => redirect("/\\evil.com")).toThrow();
    });

    test("rejects javascript: and data: schemes", () => {
      expect(() => redirect("javascript:alert(1)")).toThrow();
      expect(() => redirect("data:text/html,x")).toThrow();
    });

    test("allows same-path redirects", () => {
      expect(redirect("/foo").headers.get("Location")).toBe("/foo");
      expect(redirect("/foo?q=1#x").headers.get("Location")).toBe("/foo?q=1#x");
    });

    test("opt-in: allowExternal lets through absolute URL", () => {
      const res = redirect("https://allowed.example/path", 302, undefined, { allowExternal: true });
      expect(res.headers.get("Location")).toBe("https://allowed.example/path");
    });
  });
});

describe("json", () => {
  test("sets Content-Type to application/json", () => {
    const res = json({ ok: true });
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  test("serializes data to JSON body", async () => {
    const res = json({ name: "bract", version: 1 });
    const body = await res.json() as { name: string; version: number };
    expect(body.name).toBe("bract");
    expect(body.version).toBe(1);
  });

  test("defaults to 200 status", () => {
    expect(json({}).status).toBe(200);
  });

  test("respects custom status in init", () => {
    expect(json({}, { status: 201 }).status).toBe(201);
  });

  test("merges custom headers while preserving Content-Type", () => {
    const res = json({}, { headers: { "X-Custom": "yes" } });
    expect(res.headers.get("X-Custom")).toBe("yes");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  test("serializes arrays", async () => {
    const res = json([1, 2, 3]);
    const body = await res.json() as number[];
    expect(body).toEqual([1, 2, 3]);
  });

  test("serializes null", async () => {
    const res = json(null);
    expect(await res.text()).toBe("null");
  });
});

describe("error", () => {
  test("returns 500 by default", () => {
    expect(error("internal").status).toBe(500);
  });

  test("body is JSON with error field", async () => {
    const res = error("something failed");
    const body = await res.json() as { error: string };
    expect(body.error).toBe("something failed");
  });

  test("accepts custom status", () => {
    expect(error("not allowed", 403).status).toBe(403);
  });
});
