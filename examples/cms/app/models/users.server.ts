import { db, newId, nowTs } from "../db.server.ts";

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  provider: string;
  avatarUrl: string | null;
  createdAt: number;
};

type Row = User & { passwordHash: string };

const PUBLIC = "id, username, displayName, role, email, provider, avatarUrl, createdAt";

/** Lower-case + trim so lookups/uniqueness are case-insensitive. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function listUsers(): User[] {
  return db.query<User, []>(`SELECT ${PUBLIC} FROM users ORDER BY createdAt ASC`).all();
}

export function getUserById(id: string): User | null {
  return db.query<User, [string]>(`SELECT ${PUBLIC} FROM users WHERE id = ?`).get(id) ?? null;
}

export function findUserByUsername(username: string): Row | null {
  return db.query<Row, [string]>("SELECT * FROM users WHERE username = ?").get(username) ?? null;
}

export function findUserByEmail(email: string): User | null {
  return db.query<User, [string]>(`SELECT ${PUBLIC} FROM users WHERE email = ?`).get(normalizeEmail(email)) ?? null;
}

/**
 * OAuth sign-in is authorization-gated by the user table itself: an account must
 * already exist with the verified provider email. We never auto-provision admins
 * from an arbitrary Google/Microsoft account. On match we refresh the cached
 * display name / avatar and record which provider was last used.
 */
export function upsertOAuthUser(input: {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  provider: "google" | "microsoft";
}): User | null {
  const existing = findUserByEmail(input.email);
  if (!existing) return null;
  db.run("UPDATE users SET displayName = ?, avatarUrl = ?, provider = ? WHERE id = ?", [
    input.name?.trim() || existing.displayName,
    input.avatarUrl ?? existing.avatarUrl,
    input.provider,
    existing.id,
  ]);
  return getUserById(existing.id);
}

export function userCount(): number {
  return db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()?.n ?? 0;
}

/** The user's current session epoch (bumped on password change to revoke old sessions). */
export function getUserSessionEpoch(id: string): number {
  return db.query<{ sessionEpoch: number }, [string]>("SELECT sessionEpoch FROM users WHERE id = ?").get(id)?.sessionEpoch ?? 0;
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

export async function createUser(input: {
  username: string;
  password: string;
  displayName: string;
  email: string;
  role?: string;
}): Promise<{ ok: boolean; reason?: string; user?: User }> {
  if (findUserByUsername(input.username)) {
    return { ok: false, reason: "That username is already taken." };
  }
  const email = normalizeEmail(input.email);
  if (findUserByEmail(email)) {
    return { ok: false, reason: "That email is already in use." };
  }
  const id = newId();
  const hash = await Bun.password.hash(input.password);
  db.run(
    "INSERT INTO users (id, username, passwordHash, displayName, role, email, provider, createdAt) VALUES (?,?,?,?,?,?,?,?)",
    [id, input.username, hash, input.displayName, input.role ?? "admin", email, "password", nowTs()],
  );
  return { ok: true, user: getUserById(id)! };
}

export async function updateUser(
  id: string,
  input: { displayName: string; email: string; password?: string },
): Promise<{ ok: boolean; reason?: string }> {
  const email = normalizeEmail(input.email);
  const clash = findUserByEmail(email);
  if (clash && clash.id !== id) return { ok: false, reason: "That email is already in use." };
  if (input.password && input.password.length > 0) {
    const hash = await Bun.password.hash(input.password);
    // Bump sessionEpoch so any other live session for this user is revoked on
    // its next request (a password change should kick out existing sessions).
    db.run("UPDATE users SET displayName = ?, email = ?, passwordHash = ?, sessionEpoch = sessionEpoch + 1 WHERE id = ?", [input.displayName, email, hash, id]);
  } else {
    db.run("UPDATE users SET displayName = ?, email = ? WHERE id = ?", [input.displayName, email, id]);
  }
  return { ok: true };
}

/** Refuse to delete the final user so the admin can never be locked out. */
export function deleteUser(id: string): { ok: boolean; reason?: string } {
  if (userCount() <= 1) return { ok: false, reason: "Cannot delete the last remaining user." };
  db.run("DELETE FROM users WHERE id = ?", [id]);
  return { ok: true };
}
