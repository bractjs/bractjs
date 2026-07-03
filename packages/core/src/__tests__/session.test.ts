import { describe, expect, test } from "bun:test";
import { createCookieSession } from "../server/session.ts";

const sessionStorage = createCookieSession({
  name: "__test",
  secrets: ["secret-one-1234567890", "secret-two-1234567890"],
  secure: false,
  sameSite: "Lax",
});

describe("createCookieSession — getSession", () => {
  test("returns empty session for null cookie", async () => {
    const s = await sessionStorage.getSession(null);
    expect(s.get("user")).toBeUndefined();
    expect(s.has("user")).toBe(false);
  });

  test("returns empty session for empty string cookie", async () => {
    const s = await sessionStorage.getSession("");
    expect(s.has("anything")).toBe(false);
  });

  test("returns empty session for missing cookie name", async () => {
    const s = await sessionStorage.getSession("other=value");
    expect(s.has("x")).toBe(false);
  });

  test("returns empty session for tampered signature", async () => {
    const s1 = await sessionStorage.getSession(null);
    s1.set("user", { id: 1 });
    const cookie = await sessionStorage.commitSession(s1);
    // Tamper: replace last char of cookie value
    const tampered = cookie.replace(/=([^;]+)/, (_, val) => `=${val.slice(0, -1)}X`);
    const s2 = await sessionStorage.getSession(tampered);
    expect(s2.has("user")).toBe(false);
  });
});

describe("createCookieSession — commitSession + roundtrip", () => {
  test("round-trips session data through cookie", async () => {
    const s1 = await sessionStorage.getSession(null);
    s1.set("userId", 42);
    s1.set("role", "admin");
    const cookieHeader = await sessionStorage.commitSession(s1);

    // Extract just the Set-Cookie value (first segment before ";")
    const cookieValue = cookieHeader.split(";")[0];
    const s2 = await sessionStorage.getSession(cookieValue);
    expect(s2.get("userId")).toBe(42);
    expect(s2.get("role")).toBe("admin");
  });

  test("includes HttpOnly in Set-Cookie string", async () => {
    const s = await sessionStorage.getSession(null);
    const cookie = await sessionStorage.commitSession(s);
    expect(cookie).toContain("HttpOnly");
  });

  test("includes SameSite=Lax in Set-Cookie string", async () => {
    const s = await sessionStorage.getSession(null);
    const cookie = await sessionStorage.commitSession(s);
    expect(cookie).toContain("SameSite=Lax");
  });

  test("includes Max-Age when opts.maxAge provided", async () => {
    const s = await sessionStorage.getSession(null);
    const cookie = await sessionStorage.commitSession(s, { maxAge: 3600 });
    expect(cookie).toContain("Max-Age=3600");
  });

  test("secret rotation: old secret still verifies", async () => {
    const oldStorage = createCookieSession({
      name: "__test",
      secrets: ["secret-two-1234567890"], // only the old secret
      secure: false,
    });
    const s1 = await oldStorage.getSession(null);
    s1.set("x", "y");
    const cookie = await oldStorage.commitSession(s1);

    // New storage has new secret first, old secret second (rotation)
    const newStorage = createCookieSession({
      name: "__test",
      secrets: ["secret-one-1234567890", "secret-two-1234567890"],
      secure: false,
    });
    const cookieValue = cookie.split(";")[0];
    const s2 = await newStorage.getSession(cookieValue);
    expect(s2.get("x")).toBe("y");
  });
});

describe("Session methods", () => {
  test("set / get / has / delete", async () => {
    const s = await sessionStorage.getSession(null);
    s.set("key", "value");
    expect(s.has("key")).toBe(true);
    expect(s.get("key")).toBe("value");
    s.delete("key");
    expect(s.has("key")).toBe(false);
    expect(s.get("key")).toBeUndefined();
  });
});
