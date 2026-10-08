// app/authz.server.ts — who may change whose access.
//
// `requirePermission(request, "users.manage")` says an admin may open the user
// editor; it doesn't say WHAT they may grant there. Without the rules below, a
// user holding only `users.manage` could tick the Administrator role on their
// own account (or change an Administrator's email and receive their sign-in
// codes), and `roles.manage` could add `users.manage` to a role they hold.
//
// The rules (least privilege):
// - Subset rule: you may grant a role, a group, or a set of permissions only
//   when every permission involved is one you hold yourself.
// - You may edit or delete another user only when everything THEY hold, you
//   hold too — a limited admin can't touch an Administrator.
// - No self-edit of access: your own roles, groups, email and password can't be
//   changed from the admin user editor (a stolen session can't lock itself in).
// - At least one user always keeps the Administrator role, directly OR through
//   a group.
//
// Every check compares against what is stored now: a save re-posts all current
// values, so only what is ADDED (or actually changed) is checked.

import type { AdminUser } from "./auth.server.ts";
import {
  groupRoleIds,
  listGroups,
  roleByName,
  rolePermissions,
  userGroupIds,
  userPermissions,
  userRoleIds,
} from "./models/rbac.server.ts";
import { listUsers } from "./models/users.server.ts";

const holdsAll = (actor: AdminUser, permissions: readonly string[]): boolean =>
  permissions.every((p) => (actor.permissions as string[]).includes(p));

/** Ids in `next` that aren't in `current`. */
export function addedIds(next: readonly string[], current: readonly string[]): string[] {
  return next.filter((id) => !current.includes(id));
}

/** Whether two id lists hold the same ids (order and duplicates aside). */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((id) => y.has(id));
}

/** The actor holds every permission the role grants. */
export function canGrantRole(actor: AdminUser, roleId: string): boolean {
  return holdsAll(actor, rolePermissions(roleId));
}

/** The actor holds every permission any of the group's roles grants (`roleIds`: the group's roles, default its current ones). */
export function canGrantGroup(actor: AdminUser, groupId: string, roleIds = groupRoleIds(groupId)): boolean {
  return roleIds.every((roleId) => canGrantRole(actor, roleId));
}

/** The actor holds every one of these permissions (editing a role's permission set). */
export function canEditPermissions(actor: AdminUser, permissions: readonly string[]): boolean {
  return holdsAll(actor, permissions);
}

/** The actor holds everything the target user holds — so editing them can't reach beyond the actor's own access. */
export function canManageUser(actor: AdminUser, targetId: string): boolean {
  return holdsAll(actor, userPermissions(targetId));
}

// ── Last-Administrator guard ─────────────────────────────────────────────────

/** A pending change to who holds which role, checked before it is applied. */
export type AccessChange =
  | { kind: "user"; userId: string; roleIds?: string[]; groupIds?: string[] }
  | { kind: "deleteUser"; userId: string }
  | { kind: "group"; groupId: string; roleIds: string[]; memberIds: string[] }
  | { kind: "deleteGroup"; groupId: string };

/** Users who hold the Administrator role (directly or via a group) — after `change`, when given. */
function administratorsAfter(adminRoleId: string, change?: AccessChange): Set<string> {
  const groupIds = listGroups().map((g) => g.id);
  const groupRoles = (groupId: string): string[] => {
    if (change?.kind === "group" && change.groupId === groupId) return change.roleIds;
    if (change?.kind === "deleteGroup" && change.groupId === groupId) return [];
    return groupRoleIds(groupId);
  };
  const adminGroups = new Set(groupIds.filter((g) => groupRoles(g).includes(adminRoleId)));
  const out = new Set<string>();
  for (const { id } of listUsers()) {
    if (change?.kind === "deleteUser" && change.userId === id) continue;
    const ownChange = change?.kind === "user" && change.userId === id ? change : null;
    const roles = ownChange?.roleIds ?? userRoleIds(id);
    let groups = ownChange?.groupIds ?? userGroupIds(id);
    if (change?.kind === "group") {
      groups = groups.filter((g) => g !== change.groupId);
      if (change.memberIds.includes(id)) groups.push(change.groupId);
    }
    if (roles.includes(adminRoleId) || groups.some((g) => adminGroups.has(g))) out.add(id);
  }
  return out;
}

/** Whether `change` would take the last Administrator away (directly-assigned or through a group). */
export function leavesNoAdministrator(change: AccessChange): boolean {
  const admin = roleByName("Administrator");
  if (!admin) return false;
  return administratorsAfter(admin.id).size > 0 && administratorsAfter(admin.id, change).size === 0;
}
