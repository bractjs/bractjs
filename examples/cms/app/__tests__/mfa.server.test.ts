import { test, expect, beforeEach } from "bun:test";
import { db } from "../db.server.ts";
import { createUser } from "../models/users.server.ts";
import { issueLoginCode, verifyLoginCode, _resetRateLimits } from "../mfa.server.ts";

beforeEach(() => _resetRateLimits());

const rnd = () => crypto.randomUUID().slice(0, 8);
const sha256 = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
async function freshUser() {
  return (await createUser({ username: `m-${rnd()}`, password: "secret123", displayName: "M", email: `${rnd()}@example.com` })).user!;
}
function plantCode(userId: string, code: string, opts: { expiresAt?: number; attempts?: number } = {}) {
  db.run(
    `INSERT INTO login_codes (userId, codeHash, expiresAt, attempts) VALUES (?,?,?,?)
     ON CONFLICT(userId) DO UPDATE SET codeHash=excluded.codeHash, expiresAt=excluded.expiresAt, attempts=excluded.attempts`,
    [userId, sha256(code), opts.expiresAt ?? Date.now() + 60_000, opts.attempts ?? 0],
  );
}
const codeRow = (userId: string) =>
  db.query<{ attempts: number }, [string]>("SELECT attempts FROM login_codes WHERE userId = ?").get(userId);

test("issueLoginCode stores a fresh, unexpired code row for the user", async () => {
  const u = await freshUser();
  const res = await issueLoginCode(u, `ip-${u.id}`);
  expect(res.ok).toBe(true);
  const row = db.query<{ expiresAt: number; attempts: number }, [string]>(
    "SELECT expiresAt, attempts FROM login_codes WHERE userId = ?",
  ).get(u.id);
  expect(row).not.toBeNull();
  expect(row!.attempts).toBe(0);
  expect(row!.expiresAt).toBeGreaterThan(Date.now());
});

test("issueLoginCode refuses an account with no email", async () => {
  const res = await issueLoginCode({ id: "no-email", email: null }, "ip-x");
  expect(res.ok).toBe(false);
  expect((res as { status: number }).status).toBe(400);
});

test("verifyLoginCode consumes a correct code (single use)", async () => {
  const u = await freshUser();
  plantCode(u.id, "123456");
  expect(verifyLoginCode(u.id, "123456", `ip-${u.id}`).ok).toBe(true);
  expect(codeRow(u.id)).toBeNull(); // deleted on success
  // A second attempt with the same code now fails — it's gone.
  expect(verifyLoginCode(u.id, "123456", `ip-${u.id}`).ok).toBe(false);
});

test("verifyLoginCode rejects a wrong code and counts the attempt", async () => {
  const u = await freshUser();
  plantCode(u.id, "111111");
  const res = verifyLoginCode(u.id, "222222", `ip-${u.id}`);
  expect(res.ok).toBe(false);
  expect((res as { status: number }).status).toBe(400);
  expect(codeRow(u.id)!.attempts).toBe(1);
});

test("verifyLoginCode rejects an expired code", async () => {
  const u = await freshUser();
  plantCode(u.id, "123456", { expiresAt: Date.now() - 1 });
  const res = verifyLoginCode(u.id, "123456", `ip-${u.id}`);
  expect(res.ok).toBe(false);
  expect((res as { status: number }).status).toBe(400);
});

test("verifyLoginCode locks out after the attempt cap and purges the code", async () => {
  const u = await freshUser();
  plantCode(u.id, "123456", { attempts: 5 });
  const res = verifyLoginCode(u.id, "123456", `ip-${u.id}`);
  expect(res.ok).toBe(false);
  expect((res as { status: number }).status).toBe(429);
  expect(codeRow(u.id)).toBeNull();
});
