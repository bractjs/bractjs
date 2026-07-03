// Runs against an in-memory SQLite DB (db.server.ts uses :memory: when
// NODE_ENV=test, which `bun test` sets). Tests use random usernames/emails so
// they don't collide with the seed admin or each other in the shared process.
import { expect, test } from "bun:test";
import {
  createUser,
  findUserByEmail,
  normalizeEmail,
  updateUser,
  upsertOAuthUser,
} from "../models/users.server.ts";

const rnd = () => crypto.randomUUID().slice(0, 8);
const make = (over: Partial<{ username: string; email: string }> = {}) =>
  createUser({
    username: over.username ?? `u-${rnd()}`,
    password: "secret123",
    displayName: "Test User",
    email: over.email ?? `${rnd()}@example.com`,
  });

test("normalizeEmail lower-cases and trims", () => {
  expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
});

test("createUser stores email + provider and is findable by email (case-insensitive)", async () => {
  const email = `Mixed-${rnd()}@Example.com`;
  const res = await make({ email });
  expect(res.ok).toBe(true);
  expect(res.user!.provider).toBe("password");
  expect(res.user!.email).toBe(email.toLowerCase());
  const found = findUserByEmail(email.toUpperCase());
  expect(found?.id).toBe(res.user!.id);
});

test("createUser rejects a duplicate username", async () => {
  const username = `dup-${rnd()}`;
  expect((await make({ username })).ok).toBe(true);
  const again = await make({ username });
  expect(again.ok).toBe(false);
  expect(again.reason).toMatch(/username/i);
});

test("createUser rejects a duplicate email", async () => {
  const email = `dupe-${rnd()}@example.com`;
  expect((await make({ email })).ok).toBe(true);
  const again = await make({ email });
  expect(again.ok).toBe(false);
  expect(again.reason).toMatch(/email/i);
});

test("updateUser refuses an email already taken by another user", async () => {
  const a = (await make()).user!;
  const b = (await make()).user!;
  const res = await updateUser(b.id, { displayName: "B", email: a.email! });
  expect(res.ok).toBe(false);
  // Keeping its own email is fine.
  expect((await updateUser(b.id, { displayName: "B", email: b.email! })).ok).toBe(true);
});

test("upsertOAuthUser signs in an existing account and records the provider", async () => {
  const u = (await make()).user!;
  const updated = upsertOAuthUser({
    email: u.email!.toUpperCase(),
    name: "From Google",
    avatarUrl: "http://x/a.png",
    provider: "google",
  });
  expect(updated?.id).toBe(u.id);
  expect(updated?.provider).toBe("google");
  expect(updated?.displayName).toBe("From Google");
  expect(updated?.avatarUrl).toBe("http://x/a.png");
});

test("upsertOAuthUser never auto-provisions an unknown email", () => {
  const res = upsertOAuthUser({
    email: `nope-${rnd()}@example.com`,
    name: "X",
    avatarUrl: null,
    provider: "microsoft",
  });
  expect(res).toBeNull();
});
