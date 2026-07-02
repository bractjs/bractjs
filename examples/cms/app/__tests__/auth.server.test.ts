import { expect, test } from "bun:test";
import {
  authenticatePassword,
  beginPendingMfa,
  clearPendingMfa,
  getAdmin,
  getPendingUserId,
  loginCookie,
  logoutCookie,
  readOAuthState,
  requireAdmin,
  setOAuthState,
} from "../auth.server.ts";
import { createUser } from "../models/users.server.ts";

const rnd = () => crypto.randomUUID().slice(0, 8);
const make = () =>
  createUser({
    username: `a-${rnd()}`,
    password: "secret123",
    displayName: "A",
    email: `${rnd()}@example.com`,
  });
/** A Cookie header value is just the `name=value` first segment of Set-Cookie. */
const cookieHeader = (setCookie: string) => setCookie.split(";")[0]!;
const reqWith = (setCookie: string) =>
  new Request("http://x/", { headers: { cookie: cookieHeader(setCookie) } });

test("authenticatePassword: correct password returns the user without the hash", async () => {
  const u = (await make()).user!;
  const ok = await authenticatePassword(u.username, "secret123");
  expect(ok?.id).toBe(u.id);
  expect((ok as Record<string, unknown>).passwordHash).toBeUndefined();
});

test("authenticatePassword: wrong password or unknown user returns null", async () => {
  const u = (await make()).user!;
  expect(await authenticatePassword(u.username, "wrong")).toBeNull();
  expect(await authenticatePassword(`ghost-${rnd()}`, "secret123")).toBeNull();
});

test("session round-trip: loginCookie → getAdmin resolves the user; logout clears it", async () => {
  const u = (await make()).user!;
  const set = await loginCookie(u);
  expect(await getAdmin(reqWith(set))).not.toBeNull();
  expect((await getAdmin(reqWith(set)))!.id).toBe(u.id);

  const out = await logoutCookie();
  expect(out).toContain("Max-Age=0");
  expect(await getAdmin(reqWith(out))).toBeNull();
});

test("getAdmin returns null with no/garbage cookie", async () => {
  expect(await getAdmin(new Request("http://x/"))).toBeNull();
  expect(
    await getAdmin(new Request("http://x/", { headers: { cookie: "cms_session=tampered.sig" } })),
  ).toBeNull();
});

test("requireAdmin throws a 302 redirect to /admin/login when unauthenticated", async () => {
  let thrown: unknown;
  try {
    await requireAdmin(new Request("http://x/admin"));
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(Response);
  expect((thrown as Response).status).toBe(302);
  expect((thrown as Response).headers.get("Location")).toBe("/admin/login");
});

test("pending-MFA cookie holds only the user id between factors", async () => {
  const u = (await make()).user!;
  const set = await beginPendingMfa(u.id);
  expect(await getPendingUserId(reqWith(set))).toBe(u.id);
  // The pending cookie must NOT count as a full session.
  expect(await getAdmin(reqWith(set))).toBeNull();
  expect(await clearPendingMfa()).toContain("Max-Age=0");
});

test("OAuth state cookie round-trips state + provider", async () => {
  const state = crypto.randomUUID();
  const set = await setOAuthState("google", state);
  const read = await readOAuthState(reqWith(set));
  expect(read).toEqual({ state, provider: "google" });
});
