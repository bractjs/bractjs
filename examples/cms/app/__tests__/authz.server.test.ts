// Who may change whose access: the subset rule, no self-edit, the
// last-Administrator guard — through the real admin route actions.
import { describe, expect, test } from "bun:test";
import { callAction } from "@bractjs/bractjs/testing";
import { resolve } from "node:path";
import { type AdminUser, getAdmin, loginCookie } from "../auth.server.ts";
import {
  canEditPermissions,
  canGrantGroup,
  canGrantRole,
  canManageUser,
  leavesNoAdministrator,
} from "../authz.server.ts";
import {
  createGroup,
  createRole,
  groupMemberIds,
  groupRoleIds,
  roleByName,
  rolePermissions,
  setGroupMembers,
  setGroupRoles,
  setRolePermissions,
  setUserGroups,
  setUserRoles,
  updateRole,
  userRoleIds,
} from "../models/rbac.server.ts";
import { createUser, getUserById, type User } from "../models/users.server.ts";
import { action as editGroup } from "../routes/admin/groups/[id].tsx";
import { action as editRole } from "../routes/admin/roles/[id].tsx";
import { action as editUser } from "../routes/admin/users/[id].tsx";

const rnd = () => crypto.randomUUID().slice(0, 8);
const mkUser = async (): Promise<User> =>
  (
    await createUser({
      username: `z-${rnd()}`,
      password: "secret123",
      displayName: "Z",
      email: `${rnd()}@ex.com`,
    })
  ).user!;
const mkRole = (perms: string[]): string => {
  const id = createRole({ name: `Role-${rnd()}`, description: "" }).id!;
  setRolePermissions(id, perms);
  return id;
};
const adminRole = () => roleByName("Administrator")!.id;

async function cookieFor(user: User): Promise<string> {
  return (await loginCookie(user)).split(";")[0];
}
async function asActor(user: User): Promise<AdminUser> {
  return (await getAdmin(new Request("http://x/", { headers: { cookie: await cookieFor(user) } })))!;
}

/** Run a route action as `actor` with these form fields; the flash error, or "ok" on a redirect. */
async function post(
  actor: User,
  action: (args: never) => unknown,
  id: string,
  fields: Array<[string, string]>,
): Promise<string> {
  const formData = new FormData();
  for (const [k, v] of fields) formData.append(k, v);
  const request = new Request(`http://x/admin/${id}`, {
    method: "POST",
    headers: { cookie: await cookieFor(actor) },
    body: formData,
  });
  const res = (await callAction(action, { params: { id }, formData, request })) as Response;
  if (res.status >= 300 && res.status < 400) return "ok";
  return ((await res.json()) as { error?: string }).error ?? "no error";
}

/** The user editor's fields for `target`, as they are now (a plain re-save). */
function userFields(target: User, extra: Array<[string, string]> = []): Array<[string, string]> {
  return [
    ["intent", "save"],
    ["displayName", target.displayName],
    ["email", target.email ?? ""],
    ...userRoleIds(target.id).map((r): [string, string] => ["roles", r]),
    ...extra,
  ];
}

describe("predicates", () => {
  test("subset rule for roles, groups, permission sets and users", async () => {
    const limited = await mkUser();
    setUserRoles(limited.id, [mkRole(["users.manage", "posts.manage"])]);
    const actor = await asActor(limited);
    expect(canGrantRole(actor, mkRole(["posts.manage"]))).toBe(true);
    expect(canGrantRole(actor, adminRole())).toBe(false);
    const g = createGroup({ name: `G-${rnd()}`, description: "" }).id!;
    setGroupRoles(g, [mkRole(["posts.manage"])]);
    expect(canGrantGroup(actor, g)).toBe(true);
    expect(canGrantGroup(actor, g, [adminRole()])).toBe(false);
    expect(canEditPermissions(actor, ["users.manage"])).toBe(true);
    expect(canEditPermissions(actor, ["roles.manage"])).toBe(false);
    const admin = await mkUser();
    setUserRoles(admin.id, [adminRole()]);
    expect(canManageUser(actor, admin.id)).toBe(false);
    expect(canManageUser(actor, (await mkUser()).id)).toBe(true);
  });

  test("the Administrator role can't be renamed (it is found by name)", () => {
    const res = updateRole(adminRole(), { name: "Superuser", description: "" });
    expect(res.ok).toBe(false);
    expect(roleByName("Administrator")).not.toBeNull();
  });
});

describe("user editor (users.manage only)", () => {
  test("can't grant itself or anyone else Administrator; can't touch an Administrator", async () => {
    const limited = await mkUser();
    setUserRoles(limited.id, [mkRole(["users.manage"])]);
    const before = userRoleIds(limited.id);

    // Self-promotion.
    expect(await post(limited, editUser, limited.id, userFields(limited, [["roles", adminRole()]]))).toMatch(
      /your own roles/,
    );
    expect(userRoleIds(limited.id)).toEqual(before);

    // Promoting someone else.
    const other = await mkUser();
    expect(await post(limited, editUser, other.id, userFields(other, [["roles", adminRole()]]))).toMatch(
      /only grant roles/,
    );
    expect(userRoleIds(other.id)).not.toContain(adminRole());

    // An Administrator's email (where their sign-in codes go).
    const admin = await mkUser();
    setUserRoles(admin.id, [adminRole()]);
    const fields = userFields(admin).map(([k, v]): [string, string] =>
      k === "email" ? [k, "me@evil.ex"] : [k, v],
    );
    expect(await post(limited, editUser, admin.id, fields)).toMatch(/access you don’t have/);
    expect(getUserById(admin.id)?.email).not.toBe("me@evil.ex");
  });

  test("own email/password can't change, but a plain re-save and a display-name edit work", async () => {
    const limited = await mkUser();
    setUserRoles(limited.id, [mkRole(["users.manage"])]);
    const self = (extra: Array<[string, string]>) =>
      // The own-account form doesn't send roles/groups (they're read-only there).
      [["intent", "save"], ["displayName", "New Name"], ["email", limited.email ?? ""], ...extra] as Array<
        [string, string]
      >;
    expect(await post(limited, editUser, limited.id, self([["password", "brandnew1"]]))).toMatch(/your own/);
    expect(await post(limited, editUser, limited.id, self([]))).toBe("ok");
    expect(getUserById(limited.id)?.displayName).toBe("New Name");
  });

  test("an Administrator can grant Administrator", async () => {
    const admin = await mkUser();
    setUserRoles(admin.id, [adminRole()]);
    const other = await mkUser();
    expect(await post(admin, editUser, other.id, userFields(other, [["roles", adminRole()]]))).toBe("ok");
    expect(userRoleIds(other.id)).toContain(adminRole());
  });
});

describe("groups and roles (roles.manage only)", () => {
  test("can't add itself to a group, or put Administrator on one", async () => {
    const limited = await mkUser();
    setUserRoles(limited.id, [mkRole(["roles.manage"])]);
    const g = createGroup({ name: `G-${rnd()}`, description: "" }).id!;
    const name: Array<[string, string]> = [["name", `G-${rnd()}`]];
    expect(await post(limited, editGroup, g, [...name, ["members", limited.id]])).toMatch(/add yourself/);
    expect(groupMemberIds(g)).not.toContain(limited.id);
    expect(await post(limited, editGroup, g, [...name, ["roles", adminRole()]])).toMatch(/hold yourself/);
    expect(groupRoleIds(g)).not.toContain(adminRole());
  });

  test("can't add a permission it doesn't hold to a role (even one it belongs to)", async () => {
    const own = mkRole(["roles.manage"]);
    const limited = await mkUser();
    setUserRoles(limited.id, [own]);
    const res = await post(limited, editRole, own, [
      ["name", `Role-${rnd()}`],
      ["permissions", "roles.manage"],
      ["permissions", "users.manage"],
    ]);
    expect(res).toMatch(/permissions you hold/);
    expect(rolePermissions(own)).toEqual(["roles.manage"]);
  });
});

describe("last Administrator", () => {
  test("counts Administrator rights granted through a group", async () => {
    // Make the group the ONLY source of Administrator, for this check alone.
    const admins = (await import("../models/users.server.ts"))
      .listUsers()
      .filter((u) => userRoleIds(u.id).includes(adminRole()));
    const saved = admins.map((u) => [u.id, userRoleIds(u.id)] as const);
    const viaGroup = await mkUser();
    const g = createGroup({ name: `G-${rnd()}`, description: "" }).id!;
    setGroupRoles(g, [adminRole()]);
    setGroupMembers(g, [viaGroup.id]);
    try {
      for (const u of admins) setUserRoles(u.id, []);
      expect(
        leavesNoAdministrator({ kind: "group", groupId: g, roleIds: [adminRole()], memberIds: [] }),
      ).toBe(true);
      expect(leavesNoAdministrator({ kind: "deleteGroup", groupId: g })).toBe(true);
      expect(leavesNoAdministrator({ kind: "user", userId: viaGroup.id, roleIds: [], groupIds: [] })).toBe(
        true,
      );
      expect(leavesNoAdministrator({ kind: "deleteUser", userId: (await mkUser()).id })).toBe(false);
    } finally {
      for (const [id, roles] of saved) setUserRoles(id, [...roles]);
      setUserGroups(viaGroup.id, []);
    }
  });
});

test("a user saved without roles is NOT promoted to Administrator on the next boot", async () => {
  const dbFile = resolve(import.meta.dir, `.tmp-authz-${rnd()}.db`);
  const env = { ...process.env, CMS_DB: dbFile, NODE_ENV: "test", SESSION_SECRET: "0123456789abcdef0123" };
  const run = async (code: string): Promise<string> => {
    const proc = Bun.spawn([process.execPath, "-e", code], {
      env,
      stdout: "pipe",
      stderr: "pipe",
      cwd: resolve(import.meta.dir, "../.."),
    });
    const [out, err, exit] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exit !== 0) throw new Error(err);
    return out.trim();
  };
  const users = JSON.stringify(resolve(import.meta.dir, "../models/users.server.ts"));
  const rbac = JSON.stringify(resolve(import.meta.dir, "../models/rbac.server.ts"));
  try {
    // Boot 1: create a user with no role assignment at all.
    const id = await run(
      `const { createUser } = await import(${users});` +
        `const r = await createUser({ username: "plain", password: "secret123", displayName: "P", email: "p@ex.com" });` +
        `console.log(r.user.id);`,
    );
    // Boot 2: the RBAC bootstrap runs again over the same database.
    const roles = await run(
      `const { userRoleIds } = await import(${rbac}); console.log(JSON.stringify(userRoleIds(${JSON.stringify(id)})));`,
    );
    expect(JSON.parse(roles)).toEqual([]);
    // All access moved into groups: no DIRECT assignment left anywhere. The
    // back-fill must not run again and re-promote the seeded admin.
    const seededAdmin = await run(
      `const { db } = await import(${JSON.stringify(resolve(import.meta.dir, "../db.server.ts"))});` +
        `db.run("DELETE FROM user_roles");` +
        `console.log(db.query("SELECT id FROM users WHERE username = 'admin'").get().id);`,
    );
    const after = await run(
      `const { userRoleIds } = await import(${rbac}); console.log(JSON.stringify(userRoleIds(${JSON.stringify(seededAdmin)})));`,
    );
    expect(JSON.parse(after)).toEqual([]);
  } finally {
    for (const suffix of ["", "-shm", "-wal"])
      await Bun.file(dbFile + suffix)
        .delete()
        .catch(() => {});
  }
});
