// In-memory DB (NODE_ENV=test). The boot bootstrap creates the Administrator +
// Editor roles and assigns the seeded admin, so those exist here too.
import { test, expect } from "bun:test";
import { createUser } from "../models/users.server.ts";
import {
  createRole, getRole, roleByName, setRolePermissions, rolePermissions, deleteRole,
  createGroup, setGroupRoles, setGroupMembers, groupMemberIds,
  setUserRoles, setUserGroups, userRoleIds, userGroupIds, userPermissions, userRoleNames,
  countUsersWithPermission, directRoleMemberCount,
} from "../models/rbac.server.ts";

const rnd = () => crypto.randomUUID().slice(0, 8);
const mkUser = async () => (await createUser({ username: `r-${rnd()}`, password: "secret123", displayName: "R", email: `${rnd()}@ex.com` })).user!;
const mkRole = (perms: string[]) => {
  const id = createRole({ name: `Role-${rnd()}`, description: "" }).id!;
  setRolePermissions(id, perms);
  return id;
};

test("Administrator role is system: locked permissions, undeletable", () => {
  const admin = roleByName("Administrator")!;
  expect(admin.isSystem).toBe(true);
  const before = rolePermissions(admin.id).length;
  setRolePermissions(admin.id, []); // no-op for system role
  expect(rolePermissions(admin.id).length).toBe(before);
  expect(deleteRole(admin.id).ok).toBe(false);
});

test("setRolePermissions replaces the set; non-system roles are deletable", () => {
  const id = mkRole(["posts.manage", "pages.manage"]);
  expect(rolePermissions(id).sort()).toEqual(["pages.manage", "posts.manage"]);
  setRolePermissions(id, ["media.manage"]);
  expect(rolePermissions(id)).toEqual(["media.manage"]);
  expect(deleteRole(id).ok).toBe(true);
  expect(getRole(id)).toBeNull();
});

test("effective permissions = direct roles ∪ group roles", async () => {
  const u = await mkUser();
  const direct = mkRole(["posts.manage"]);
  const viaGroupRole = mkRole(["users.manage", "menus.manage"]);
  const g = createGroup({ name: `G-${rnd()}`, description: "" }).id!;
  setGroupRoles(g, [viaGroupRole]);
  setUserRoles(u.id, [direct]);
  setUserGroups(u.id, [g]);
  expect(userRoleIds(u.id)).toEqual([direct]);
  expect(userGroupIds(u.id)).toEqual([g]);
  expect([...userPermissions(u.id)].sort()).toEqual(["menus.manage", "posts.manage", "users.manage"]);
});

test("setGroupMembers / groupMemberIds round-trip", async () => {
  const a = await mkUser();
  const b = await mkUser();
  const g = createGroup({ name: `G-${rnd()}`, description: "" }).id!;
  setGroupMembers(g, [a.id, b.id]);
  expect(groupMemberIds(g).sort()).toEqual([a.id, b.id].sort());
  // Membership grants the group's roles' permissions.
  const role = mkRole(["categories.manage"]);
  setGroupRoles(g, [role]);
  expect(userPermissions(a.id)).toContain("categories.manage");
});

test("countUsersWithPermission + directRoleMemberCount (lockout inputs)", async () => {
  const role = mkRole(["roles.manage"]);
  const u1 = await mkUser();
  const u2 = await mkUser();
  setUserRoles(u1.id, [role]);
  setUserRoles(u2.id, [role]);
  expect(directRoleMemberCount(role)).toBe(2);
  expect(countUsersWithPermission("roles.manage")).toBeGreaterThanOrEqual(2);
  expect(userRoleNames(u1.id)).toContain(getRole(role)!.name);
});
