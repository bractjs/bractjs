import { describe, expect, test } from "bun:test";
import { BractJSError, HttpError, isBractJSError, isHttpError, isRedirect } from "../shared/errors.ts";

describe("BractJSError", () => {
  test("sets name, message, and default status 500", () => {
    const e = new BractJSError("something went wrong");
    expect(e.name).toBe("BractJSError");
    expect(e.message).toBe("something went wrong");
    expect(e.status).toBe(500);
    expect(e).toBeInstanceOf(Error);
  });

  test("accepts custom status", () => {
    const e = new BractJSError("forbidden", 403);
    expect(e.status).toBe(403);
  });
});

describe("HttpError", () => {
  test("derives message from known status codes", () => {
    expect(new HttpError(400).message).toBe("Bad Request");
    expect(new HttpError(401).message).toBe("Unauthorized");
    expect(new HttpError(403).message).toBe("Forbidden");
    expect(new HttpError(404).message).toBe("Not Found");
    expect(new HttpError(405).message).toBe("Method Not Allowed");
    expect(new HttpError(422).message).toBe("Unprocessable Entity");
    expect(new HttpError(429).message).toBe("Too Many Requests");
    expect(new HttpError(500).message).toBe("Internal Server Error");
    expect(new HttpError(503).message).toBe("Service Unavailable");
  });

  test("falls back to generic message for unknown codes", () => {
    expect(new HttpError(418).message).toBe("HTTP Error 418");
  });

  test("accepts explicit message override", () => {
    const e = new HttpError(403, "Custom denied");
    expect(e.message).toBe("Custom denied");
    expect(e.status).toBe(403);
  });

  test("name is HttpError and inherits from BractJSError", () => {
    const e = new HttpError(500);
    expect(e.name).toBe("HttpError");
    expect(e).toBeInstanceOf(BractJSError);
    expect(e).toBeInstanceOf(Error);
  });
});

describe("isRedirect", () => {
  test("returns true for 3xx Response", () => {
    expect(isRedirect(new Response(null, { status: 302, headers: { Location: "/" } }))).toBe(true);
    expect(isRedirect(new Response(null, { status: 301, headers: { Location: "/new" } }))).toBe(true);
    expect(isRedirect(new Response(null, { status: 307, headers: { Location: "/tmp" } }))).toBe(true);
  });

  test("returns false for non-3xx Response", () => {
    expect(isRedirect(new Response(null, { status: 200 }))).toBe(false);
    expect(isRedirect(new Response(null, { status: 404 }))).toBe(false);
    expect(isRedirect(new Response(null, { status: 500 }))).toBe(false);
  });

  test("returns false for non-Response values", () => {
    expect(isRedirect(null)).toBe(false);
    expect(isRedirect(undefined)).toBe(false);
    expect(isRedirect("https://example.com")).toBe(false);
    expect(isRedirect({ status: 302 })).toBe(false);
  });
});

describe("isHttpError", () => {
  test("returns true for HttpError instances", () => {
    expect(isHttpError(new HttpError(404))).toBe(true);
  });

  test("returns false for plain Error", () => {
    expect(isHttpError(new Error("boom"))).toBe(false);
  });

  test("returns false for BractJSError (not HttpError)", () => {
    expect(isHttpError(new BractJSError("oops"))).toBe(false);
  });

  test("returns false for non-errors", () => {
    expect(isHttpError(null)).toBe(false);
    expect(isHttpError(404)).toBe(false);
  });
});

describe("isBractJSError", () => {
  test("returns true for BractJSError", () => {
    expect(isBractJSError(new BractJSError("x"))).toBe(true);
  });

  test("returns true for HttpError (subclass)", () => {
    expect(isBractJSError(new HttpError(500))).toBe(true);
  });

  test("returns false for plain Error", () => {
    expect(isBractJSError(new Error("plain"))).toBe(false);
  });

  test("returns false for non-errors", () => {
    expect(isBractJSError(null)).toBe(false);
    expect(isBractJSError("error")).toBe(false);
  });
});
