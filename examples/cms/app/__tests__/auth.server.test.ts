import { expect, test } from "bun:test";
import { UNKNOWN_IP } from "../ratelimit.server.ts";
import {
  _resetLoginRateLimits,
  authenticatePassword,
  checkLoginRate,
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
import { createUser, updateUser } from "../models/users.server.ts";

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

test("checkLoginRate: anonymous junk logins can't lock out everyone (no shared 'unknown' IP bucket)", async () => {
  await _resetLoginRateLimits();
  try {
    // Without TRUST_PROXY every client's IP is UNKNOWN_IP. 100 attempts with
    // random usernames used to exhaust a single global 30/15min bucket.
    for (let i = 0; i < 100; i++) await checkLoginRate(`junk-${i}`, UNKNOWN_IP);
    expect((await checkLoginRate("admin", UNKNOWN_IP)).ok).toBe(true);
    // The per-username limit still holds.
    for (let i = 0; i < 10; i++) await checkLoginRate("victim", UNKNOWN_IP); // limit is 10/window
    expect((await checkLoginRate("victim", UNKNOWN_IP)).ok).toBe(false);
    // A real (proxy-attested) IP is still limited.
    for (let i = 0; i < 30; i++) await checkLoginRate(`spray-${i}`, "203.0.113.9");
    expect((await checkLoginRate("someone", "203.0.113.9")).ok).toBe(false);
  } finally {
    await _resetLoginRateLimits();
  }
});

test("checkLoginRate: one client's junk attempts don't lock the user out from another client", async () => {
  await _resetLoginRateLimits();
  try {
    for (let i = 0; i < 10; i++) await checkLoginRate("admin", UNKNOWN_IP, "198.51.100.1");
    expect((await checkLoginRate("admin", UNKNOWN_IP, "198.51.100.1")).ok).toBe(false);
    expect((await checkLoginRate("admin", UNKNOWN_IP, "198.51.100.2")).ok).toBe(true);
    // Without a known client address the lock stays username-wide.
    for (let i = 0; i < 10; i++) await checkLoginRate("solo", UNKNOWN_IP, UNKNOWN_IP);
    expect((await checkLoginRate("solo", UNKNOWN_IP, "198.51.100.3")).ok).toBe(true);
    expect((await checkLoginRate("solo", UNKNOWN_IP, UNKNOWN_IP)).ok).toBe(false);
  } finally {
    await _resetLoginRateLimits();
  }
});

test("checkLoginRate: a per-username ceiling bounds a brute force spread over many addresses", async () => {
  await _resetLoginRateLimits();
  try {
    for (let i = 0; i < 100; i++) await checkLoginRate("target", UNKNOWN_IP, `10.0.${i >> 8}.${i & 255}`);
    expect((await checkLoginRate("target", UNKNOWN_IP, "10.9.9.9")).ok).toBe(false);
  } finally {
    await _resetLoginRateLimits();
  }
});

test("a locked-out sign-in answers 429 with Retry-After", async () => {
  const { callAction } = await import("@bractjs/bractjs/testing");
  const { action } = await import("../routes/admin/login.tsx");
  await _resetLoginRateLimits();
  try {
    const attempt = () =>
      callAction(action, {
        formData: { username: "lockme", password: "wrong-password" },
      }) as Promise<unknown>;
    for (let i = 0; i < 10; i++) await attempt();
    const res = (await attempt()) as { data: { error: string }; init: ResponseInit };
    expect(res.init.status).toBe(429);
    expect(Number(new Headers(res.init.headers).get("Retry-After"))).toBeGreaterThan(0);
    expect(res.data.error).toMatch(/Too many sign-in attempts/);
  } finally {
    await _resetLoginRateLimits();
  }
});

test("the pending-MFA cookie expires server-side after 10 minutes, whatever the browser keeps", async () => {
  const u = (await make()).user!;
  const cookie = await beginPendingMfa(u.id);
  expect(await getPendingUserId(reqWith(cookie))).toBe(u.id);
  const realNow = Date.now;
  Date.now = () => realNow() + 10 * 60 * 1000 + 1;
  try {
    expect(await getPendingUserId(reqWith(cookie))).toBeNull();
  } finally {
    Date.now = realNow;
  }
});

test("a password change voids a pending-MFA cookie", async () => {
  const u = (await make()).user!;
  const cookie = await beginPendingMfa(u.id);
  await updateUser(u.id, { displayName: "A", email: u.email ?? "", password: "changed-456" });
  expect(await getPendingUserId(reqWith(cookie))).toBeNull();
});
