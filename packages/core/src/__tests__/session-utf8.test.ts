// Cookie sessions carry any Unicode value: the payload used to be btoa(json),
// which throws on characters outside Latin-1 ("’", "ü", "🙂") — failing every
// response that stored one (a flash message with a curly apostrophe).
import { describe, expect, test } from "bun:test";
import { createCookieSession } from "../server/session.ts";

const store = createCookieSession({ name: "s", secrets: ["0123456789abcdef0123"] });
const cookieOf = (setCookie: string) => setCookie.split(";")[0];

describe("cookie session payload encoding", () => {
  test("round-trips non-Latin-1 text", async () => {
    const session = await store.getSession(null);
    session.set("msg", "You can’t do that — über 🙂");
    const cookie = cookieOf(await store.commitSession(session));
    const read = await store.getSession(cookie);
    expect(read.get("msg")).toBe("You can’t do that — über 🙂");
  });

  test("ASCII payloads encode exactly as before (existing cookies stay valid)", async () => {
    const session = await store.getSession(null);
    session.set("userId", "abc");
    const cookie = cookieOf(await store.commitSession(session));
    const payload = cookie.split("=")[1].split(".")[0];
    const legacy = btoa(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (payload.length % 4)) % 4)),
    );
    expect(legacy.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")).toBe(payload);
    expect((await store.getSession(cookie)).get("userId")).toBe("abc");
  });
});
