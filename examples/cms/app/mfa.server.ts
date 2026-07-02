// app/mfa.server.ts
//
// Second factor: a 6-digit, single-use code emailed to the user after their
// password checks out. The code is stored hashed (SHA-256) with a 10-minute TTL
// and a 5-attempt cap; verification is constant-time. Rate limiters throttle
// both issuing and verifying so a leaked password can't be turned into endless
// code emails or a brute-force oracle.

import { Buffer } from "node:buffer";
import { db } from "./db.server.ts";
import { sendLoginCode } from "./email.server.ts";
import { createRateLimiter } from "./ratelimit.server.ts";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const HOUR = 60 * 60 * 1000;

const issuePerUser = createRateLimiter(5, HOUR); // codes per user / hour
const issuePerIp = createRateLimiter(20, HOUR); // code requests per IP / hour
const verifyPerIp = createRateLimiter(50, HOUR); // verify attempts per IP / hour

export type MfaResult =
  | { ok: true }
  | { ok: false; reason: string; status: number; retryAfterMs?: number };

function sha256(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

/** Constant-time compare of two equal-length hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Generate a code, store its hash for `user`, and email it. */
export async function issueLoginCode(
  user: { id: string; email: string | null },
  ip: string,
): Promise<MfaResult> {
  if (!user.email) {
    return { ok: false, reason: "This account has no email set for two-factor sign-in.", status: 400 };
  }
  const ipLimit = issuePerIp.check(ip);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterMs);
  const userLimit = issuePerUser.check(user.id);
  if (!userLimit.ok) return tooMany(userLimit.retryAfterMs);

  // CSPRNG, not Math.random(): the code is a security token. Uniform in
  // [0, 1_000_000) → always 6 digits, zero-padded.
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
  db.run(
    `INSERT INTO login_codes (userId, codeHash, expiresAt, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT(userId) DO UPDATE SET codeHash = excluded.codeHash, expiresAt = excluded.expiresAt, attempts = 0`,
    [user.id, sha256(code), Date.now() + CODE_TTL_MS],
  );
  try {
    await sendLoginCode(user.email, code);
  } catch (err) {
    db.run("DELETE FROM login_codes WHERE userId = ?", [user.id]);
    console.error(`[cms] failed to send sign-in code to ${user.email}:`, err);
    return { ok: false, reason: "Couldn't send a code to your email. Try again.", status: 502 };
  }
  return { ok: true };
}

/** Check a submitted code for `userId`; consumes it on success. */
export function verifyLoginCode(userId: string, code: string, ip: string): MfaResult {
  const ipLimit = verifyPerIp.check(ip);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterMs);

  const row = db
    .query<{ codeHash: string; expiresAt: number; attempts: number }, [string]>(
      "SELECT codeHash, expiresAt, attempts FROM login_codes WHERE userId = ?",
    )
    .get(userId);
  if (!row || row.expiresAt < Date.now()) {
    return { ok: false, reason: "That code has expired. Request a new one.", status: 400 };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    db.run("DELETE FROM login_codes WHERE userId = ?", [userId]);
    return { ok: false, reason: "Too many attempts. Request a new code.", status: 429 };
  }
  if (!safeEqualHex(sha256(code.trim()), row.codeHash)) {
    db.run("UPDATE login_codes SET attempts = attempts + 1 WHERE userId = ?", [userId]);
    return { ok: false, reason: "Incorrect code.", status: 400 };
  }
  db.run("DELETE FROM login_codes WHERE userId = ?", [userId]);
  return { ok: true };
}

function tooMany(retryAfterMs: number): MfaResult {
  return { ok: false, reason: "Too many requests. Please try again later.", status: 429, retryAfterMs };
}

/** Test seam: clear rate-limit windows between cases. */
export function _resetRateLimits(): void {
  issuePerUser.reset();
  issuePerIp.reset();
  verifyPerIp.reset();
}
