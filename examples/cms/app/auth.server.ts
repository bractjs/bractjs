// app/auth.server.ts
//
// Auth is enforced by reading the session INSIDE loaders/actions — not by global
// middleware. The dev server never runs app/server.ts, so a pipeline.use(...)
// there would only apply in start/compiled mode. requireAdmin(request) works
// identically in dev and prod and also covers the /_data soft-nav endpoint.
//
// Sign-in is two-factor: authenticatePassword() checks the password (factor 1),
// then a 6-digit email code (factor 2, app/mfa.server.ts) completes it. While
// the code is pending we hold only the user id in a separate short-lived,
// signed cookie — the full session cookie is issued by loginCookie() only after
// the second factor (or a successful OAuth sign-in). All three cookies are
// HMAC-signed by createCookieSession, so a client can't forge the pending state.

import { createCookieSession, redirect, HttpError } from "@bractjs/bractjs";
import { findUserByUsername, getUserById, getUserSessionEpoch, verifyPassword, type User } from "./models/users.server.ts";
import { userPermissions, userRoleNames } from "./models/rbac.server.ts";
import { IS_PROD, SESSION_SECRET } from "./env.server.ts";
import { createRateLimiter } from "./ratelimit.server.ts";
import type { Permission } from "./permissions.ts";
import type { OAuthProvider } from "./oauth.server.ts";

// SESSION_SECRET is validated in env.server.ts (boot fails in prod if it's weak).
const secrets = [SESSION_SECRET];
// A Secure cookie is dropped over http://localhost, so only set it in prod.
const cookieBase = { secrets, secure: IS_PROD, sameSite: "Lax" as const };

const sessions = createCookieSession({ name: "cms_session", maxAge: 60 * 60 * 24 * 7, ...cookieBase });
// Holds the user id between password check and code entry; expires in 10 min.
const pending = createCookieSession({ name: "cms_mfa", maxAge: 10 * 60, ...cookieBase });
// Holds the OAuth CSRF state between the start redirect and the callback.
const oauthState = createCookieSession({ name: "cms_oauth", maxAge: 10 * 60, ...cookieBase });

// Carries the user's effective RBAC permissions (direct roles ∪ group roles) and
// role names for display — computed on every read so a permission change takes
// effect on the next request without re-login.
export type AdminUser = User & { permissions: Permission[]; roleNames: string[] };

export const can = (user: AdminUser, permission: Permission): boolean => user.permissions.includes(permission);

/** Whether to show the seeded demo credentials on the login screen (dev only). */
export const showSeedCredentials = (): boolean => !IS_PROD;

/** Read the logged-in user (with permissions) from the request cookie, or null. */
export async function getAdmin(request: Request): Promise<AdminUser | null> {
  const session = await sessions.getSession(request.headers.get("cookie"));
  const id = session.get("userId");
  if (typeof id !== "string") return null;
  const user = getUserById(id); // re-fetch so a deleted user can't stay "logged in"
  if (!user) return null;
  // Session epoch: a password change bumps the user's epoch, so a cookie issued
  // before it no longer matches and is treated as logged-out. Cookies predating
  // this feature carry no epoch → treated as 0, matching the column default.
  const cookieEpoch = Number(session.get("epoch") ?? 0);
  if (cookieEpoch !== getUserSessionEpoch(user.id)) return null;
  return { ...user, permissions: userPermissions(user.id), roleNames: userRoleNames(user.id) };
}

/** Gate: throw a redirect to /admin/login when not authed. Call at the top of every admin loader/action. */
export async function requireAdmin(request: Request): Promise<AdminUser> {
  const user = await getAdmin(request);
  if (!user) throw redirect("/admin/login");
  return user;
}

/** Gate by a specific permission: redirect if logged-out, 403 if logged-in but unauthorized. */
export async function requirePermission(request: Request, permission: Permission): Promise<AdminUser> {
  const user = await requireAdmin(request);
  if (!can(user, permission)) throw new HttpError(403, "You don't have permission to do that.");
  return user;
}

// ── Factor-1 (password) brute-force throttle ─────────────────────────────────
// The MFA limiters only kick in AFTER a correct password, so without this the
// password itself could be guessed without limit. Keyed primarily by username
// (not spoofable, unlike a client IP); the IP bucket is secondary and only
// meaningful behind a trusted proxy (see clientIp / TRUST_PROXY).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginPerUser = createRateLimiter(10, LOGIN_WINDOW_MS); // attempts / username / 15 min
const loginPerIp = createRateLimiter(30, LOGIN_WINDOW_MS); // attempts / IP / 15 min

export type LoginRate = { ok: true } | { ok: false; retryAfterMs: number };

/** Throttle a password attempt. Call before authenticatePassword. */
export function checkLoginRate(username: string, ip: string): LoginRate {
  const u = loginPerUser.check(username.trim().toLowerCase());
  if (!u.ok) return { ok: false, retryAfterMs: u.retryAfterMs };
  const i = loginPerIp.check(ip);
  if (!i.ok) return { ok: false, retryAfterMs: i.retryAfterMs };
  return { ok: true };
}

/** Clear the per-username counter after a successful sign-in (don't penalize the legit user). */
export function clearLoginRate(username: string): void {
  loginPerUser.reset(username.trim().toLowerCase());
}

/** Test seam: clear login throttle windows between cases. */
export function _resetLoginRateLimits(): void {
  loginPerUser.reset();
  loginPerIp.reset();
}

// A hash of a throwaway value, verified against when the username doesn't exist
// so the no-such-user path spends ~the same time as a real password check —
// otherwise response timing would leak which usernames are valid.
let dummyHashPromise: Promise<string> | null = null;
const dummyHash = (): Promise<string> =>
  (dummyHashPromise ??= Bun.password.hash("bract-cms-timing-equalizer"));

/** Factor 1: verify the password. Returns the user (sans hash) or null. */
export async function authenticatePassword(username: string, password: string): Promise<User | null> {
  const row = findUserByUsername(username);
  if (!row) {
    await verifyPassword(password, await dummyHash()); // equalize timing vs. a real verify
    return null;
  }
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  const { passwordHash, ...user } = row;
  return user;
}

// ── Full session (issued only after the second factor / OAuth) ───────────────

// Only the id + current epoch are persisted, so any user-ish object is accepted
// (factor-2 / OAuth). The epoch lets a later password change revoke this cookie.
export async function loginCookie(user: { id: string }): Promise<string> {
  const session = await sessions.getSession(null);
  session.set("userId", user.id);
  session.set("epoch", getUserSessionEpoch(user.id));
  return sessions.commitSession(session);
}

export async function logoutCookie(): Promise<string> {
  const session = await sessions.getSession(null);
  return sessions.commitSession(session, { maxAge: 0 });
}

// ── Pending-MFA cookie (between factor 1 and factor 2) ───────────────────────

export async function beginPendingMfa(userId: string): Promise<string> {
  const session = await pending.getSession(null);
  session.set("pendingUserId", userId);
  return pending.commitSession(session);
}

export async function getPendingUserId(request: Request): Promise<string | null> {
  const session = await pending.getSession(request.headers.get("cookie"));
  const id = session.get("pendingUserId");
  return typeof id === "string" ? id : null;
}

export async function clearPendingMfa(): Promise<string> {
  const session = await pending.getSession(null);
  return pending.commitSession(session, { maxAge: 0 });
}

// ── OAuth state cookie (CSRF for the authorization-code flow) ─────────────────

export async function setOAuthState(provider: OAuthProvider, state: string): Promise<string> {
  const session = await oauthState.getSession(null);
  session.set("state", state);
  session.set("provider", provider);
  return oauthState.commitSession(session);
}

export async function readOAuthState(
  request: Request,
): Promise<{ state: string; provider: OAuthProvider } | null> {
  const session = await oauthState.getSession(request.headers.get("cookie"));
  const state = session.get("state");
  const provider = session.get("provider");
  if (typeof state !== "string" || (provider !== "google" && provider !== "microsoft")) return null;
  return { state, provider };
}

export async function clearOAuthState(): Promise<string> {
  const session = await oauthState.getSession(null);
  return oauthState.commitSession(session, { maxAge: 0 });
}
