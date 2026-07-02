// app/models/rbac.server.ts — roles, groups, and user assignments.
//
// A user's effective permissions = the union of permissions from every role
// assigned to them directly (user_roles) plus every role granted through a group
// they belong to (user_groups → group_roles). The Administrator role is
// `isSystem` (undeletable, permissions locked to the full catalog by the boot
// bootstrap in db.server.ts).

import { db, newId, nowTs, tx } from "../db.server.ts";
import type { Permission } from "../permissions.ts";
import type { User } from "./users.server.ts";

const USER_PUBLIC = "id, username, displayName, role, email, provider, avatarUrl, createdAt";

export type Role = { id: string; name: string; description: string; isSystem: boolean; createdAt: number };
type RoleRow = Omit<Role, "isSystem"> & { isSystem: number };
const toRole = (r: RoleRow): Role => ({ ...r, isSystem: !!r.isSystem });
export type Group = { id: string; name: string; description: string; createdAt: number };

// ── Roles ────────────────────────────────────────────────────────────────────
export function listRoles(): Role[] {
  return db.query<RoleRow, []>("SELECT * FROM roles ORDER BY isSystem DESC, name ASC").all().map(toRole);
}
export function getRole(id: string): Role | null {
  const r = db.query<RoleRow, [string]>("SELECT * FROM roles WHERE id = ?").get(id);
  return r ? toRole(r) : null;
}
export function roleByName(name: string): Role | null {
  const r = db.query<RoleRow, [string]>("SELECT * FROM roles WHERE name = ?").get(name);
  return r ? toRole(r) : null;
}
/** Users with this role assigned DIRECTLY (not via a group) — used for lockout guards. */
export function directRoleMemberCount(roleId: string): number {
  return db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM user_roles WHERE roleId = ?").get(roleId)?.n ?? 0;
}
export function rolePermissions(roleId: string): Permission[] {
  return db.query<{ permission: string }, [string]>("SELECT permission FROM role_permissions WHERE roleId = ?").all(roleId).map((r) => r.permission as Permission);
}
export function createRole(input: { name: string; description: string }): { ok: boolean; reason?: string; id?: string } {
  if (db.query("SELECT 1 FROM roles WHERE name = ?").get(input.name)) return { ok: false, reason: "A role with that name exists." };
  const id = newId();
  db.run("INSERT INTO roles (id, name, description, isSystem, createdAt) VALUES (?,?,?,0,?)", [id, input.name, input.description, nowTs()]);
  return { ok: true, id };
}
export function updateRole(id: string, input: { name: string; description: string }): { ok: boolean; reason?: string } {
  const clash = db.query<{ id: string }, [string]>("SELECT id FROM roles WHERE name = ?").get(input.name);
  if (clash && clash.id !== id) return { ok: false, reason: "A role with that name exists." };
  db.run("UPDATE roles SET name = ?, description = ? WHERE id = ?", [input.name, input.description, id]);
  return { ok: true };
}
export function deleteRole(id: string): { ok: boolean; reason?: string } {
  const role = getRole(id);
  if (!role) return { ok: false, reason: "Role not found." };
  if (role.isSystem) return { ok: false, reason: "The Administrator role can't be deleted." };
  db.run("DELETE FROM roles WHERE id = ?", [id]);
  return { ok: true };
}
/** Replace a role's permission set. No-op for the locked Administrator role. */
export function setRolePermissions(roleId: string, permissions: string[]): void {
  if (getRole(roleId)?.isSystem) return;
  tx(() => {
    db.run("DELETE FROM role_permissions WHERE roleId = ?", [roleId]);
    for (const p of permissions) db.run("INSERT OR IGNORE INTO role_permissions (roleId, permission) VALUES (?,?)", [roleId, p]);
  });
}

// ── Groups ───────────────────────────────────────────────────────────────────
export function listGroups(): Group[] {
  return db.query<Group, []>("SELECT * FROM groups ORDER BY name ASC").all();
}
export function getGroup(id: string): Group | null {
  return db.query<Group, [string]>("SELECT * FROM groups WHERE id = ?").get(id) ?? null;
}
export function createGroup(input: { name: string; description: string }): { ok: boolean; reason?: string; id?: string } {
  if (db.query("SELECT 1 FROM groups WHERE name = ?").get(input.name)) return { ok: false, reason: "A group with that name exists." };
  const id = newId();
  db.run("INSERT INTO groups (id, name, description, createdAt) VALUES (?,?,?,?)", [id, input.name, input.description, nowTs()]);
  return { ok: true, id };
}
export function updateGroup(id: string, input: { name: string; description: string }): { ok: boolean; reason?: string } {
  const clash = db.query<{ id: string }, [string]>("SELECT id FROM groups WHERE name = ?").get(input.name);
  if (clash && clash.id !== id) return { ok: false, reason: "A group with that name exists." };
  db.run("UPDATE groups SET name = ?, description = ? WHERE id = ?", [input.name, input.description, id]);
  return { ok: true };
}
export function deleteGroup(id: string): boolean {
  return db.run("DELETE FROM groups WHERE id = ?", [id]).changes > 0;
}
export function groupRoleIds(groupId: string): string[] {
  return db.query<{ roleId: string }, [string]>("SELECT roleId FROM group_roles WHERE groupId = ?").all(groupId).map((r) => r.roleId);
}
export function setGroupRoles(groupId: string, roleIds: string[]): void {
  tx(() => {
    db.run("DELETE FROM group_roles WHERE groupId = ?", [groupId]);
    for (const r of roleIds) db.run("INSERT OR IGNORE INTO group_roles (groupId, roleId) VALUES (?,?)", [groupId, r]);
  });
}
export function groupMemberIds(groupId: string): string[] {
  return db.query<{ userId: string }, [string]>("SELECT userId FROM user_groups WHERE groupId = ?").all(groupId).map((r) => r.userId);
}
export function setGroupMembers(groupId: string, userIds: string[]): void {
  tx(() => {
    db.run("DELETE FROM user_groups WHERE groupId = ?", [groupId]);
    for (const u of userIds) db.run("INSERT OR IGNORE INTO user_groups (userId, groupId) VALUES (?,?)", [u, groupId]);
  });
}
export function groupMemberCount(groupId: string): number {
  return db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM user_groups WHERE groupId = ?").get(groupId)?.n ?? 0;
}

// ── User assignments ─────────────────────────────────────────────────────────
export function userRoleIds(userId: string): string[] {
  return db.query<{ roleId: string }, [string]>("SELECT roleId FROM user_roles WHERE userId = ?").all(userId).map((r) => r.roleId);
}
export function setUserRoles(userId: string, roleIds: string[]): void {
  tx(() => {
    db.run("DELETE FROM user_roles WHERE userId = ?", [userId]);
    for (const r of roleIds) db.run("INSERT OR IGNORE INTO user_roles (userId, roleId) VALUES (?,?)", [userId, r]);
  });
}
export function userGroupIds(userId: string): string[] {
  return db.query<{ groupId: string }, [string]>("SELECT groupId FROM user_groups WHERE userId = ?").all(userId).map((r) => r.groupId);
}
export function setUserGroups(userId: string, groupIds: string[]): void {
  tx(() => {
    db.run("DELETE FROM user_groups WHERE userId = ?", [userId]);
    for (const g of groupIds) db.run("INSERT OR IGNORE INTO user_groups (userId, groupId) VALUES (?,?)", [userId, g]);
  });
}

/** Role names that apply to a user (direct + via groups), for display. */
export function userRoleNames(userId: string): string[] {
  return db.query<{ name: string }, [string, string]>(
    `SELECT DISTINCT r.name FROM roles r WHERE r.id IN (
       SELECT roleId FROM user_roles WHERE userId = ?
       UNION SELECT gr.roleId FROM group_roles gr JOIN user_groups ug ON ug.groupId = gr.groupId WHERE ug.userId = ?
     ) ORDER BY r.name`,
  ).all(userId, userId).map((r) => r.name);
}

/** Effective permissions: union of direct-role and group-role permissions. */
export function userPermissions(userId: string): Permission[] {
  return db.query<{ permission: string }, [string, string]>(
    `SELECT DISTINCT permission FROM role_permissions WHERE roleId IN (
       SELECT roleId FROM user_roles WHERE userId = ?
       UNION SELECT gr.roleId FROM group_roles gr JOIN user_groups ug ON ug.groupId = gr.groupId WHERE ug.userId = ?
     )`,
  ).all(userId, userId).map((r) => r.permission as Permission);
}

/** How many distinct users effectively hold `permission` (lockout guard). */
export function countUsersWithPermission(permission: Permission): number {
  return db.query<{ n: number }, [string, string]>(
    `SELECT COUNT(DISTINCT userId) AS n FROM (
       SELECT ur.userId FROM user_roles ur JOIN role_permissions rp ON rp.roleId = ur.roleId WHERE rp.permission = ?
       UNION
       SELECT ug.userId FROM user_groups ug JOIN group_roles gr ON gr.groupId = ug.groupId JOIN role_permissions rp ON rp.roleId = gr.roleId WHERE rp.permission = ?
     )`,
  ).get(permission, permission)?.n ?? 0;
}

export function groupMembers(groupId: string): User[] {
  return db.query<User, [string]>(`SELECT ${USER_PUBLIC} FROM users WHERE id IN (SELECT userId FROM user_groups WHERE groupId = ?) ORDER BY displayName`).all(groupId);
}
