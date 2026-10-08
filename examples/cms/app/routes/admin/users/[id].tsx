import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, HttpError, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import {
  addedIds,
  canGrantGroup,
  canGrantRole,
  canManageUser,
  leavesNoAdministrator,
  sameIds,
} from "../../../authz.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import {
  type Group,
  listGroups,
  listRoles,
  type Role,
  setUserGroups,
  setUserRoles,
  userGroupIds,
  userRoleIds,
} from "../../../models/rbac.server.ts";
import { deleteUser, getUserById, type User, updateUser } from "../../../models/users.server.ts";
import { dangerButton, ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";
import { type UserEditInput, UserEditSchema } from "../../../validation.ts";

type Data = {
  user: User;
  isSelf: boolean;
  roles: Role[];
  groups: Group[];
  roleIds: string[];
  groupIds: string[];
};

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  const me = await requirePermission(request, "users.manage");
  const user = getUserById(params.id);
  if (!user) throw new HttpError(404, "User not found.");
  return {
    user,
    isSelf: me.id === user.id,
    roles: listRoles(),
    groups: listGroups(),
    roleIds: userRoleIds(user.id),
    groupIds: userGroupIds(user.id),
  };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  const me = await requirePermission(request, "users.manage");
  const user = getUserById(params.id);
  if (!user) throw new HttpError(404, "User not found.");
  const isSelf = me.id === user.id;
  // A limited admin can't edit or delete someone with access they lack (an
  // Administrator's email is where their sign-in codes go).
  if (!canManageUser(me, user.id)) {
    return flashFail({ error: "You can’t change a user who has access you don’t have." });
  }

  if (String(formData.get("intent")) === "delete") {
    if (isSelf) return flashFail({ error: "You can’t delete your own account while signed in." });
    if (leavesNoAdministrator({ kind: "deleteUser", userId: user.id }))
      return flashFail({ error: "Can’t delete the last administrator." });
    const res = deleteUser(params.id);
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/users", "User deleted");
  }

  let data: UserEditInput;
  try {
    data = await validate<UserEditInput>(UserEditSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const currentRoles = userRoleIds(user.id);
  const currentGroups = userGroupIds(user.id);
  // Your own form doesn't send roles/groups (they're shown read-only): absent
  // means unchanged there. For anyone else, absent means none ticked.
  const roleIds = isSelf && !formData.has("roles") ? currentRoles : formData.getAll("roles").map(String);
  const groupIds = isSelf && !formData.has("groups") ? currentGroups : formData.getAll("groups").map(String);

  if (isSelf) {
    const changed =
      !sameIds(roleIds, currentRoles) ||
      !sameIds(groupIds, currentGroups) ||
      data.email !== (user.email ?? "").toLowerCase() ||
      data.password.length > 0;
    if (changed) {
      return flashFail({
        error: "You can’t change your own roles, groups, email or password here — ask another administrator.",
      });
    }
  }
  // Subset rule: grant only roles/groups whose permissions you hold yourself.
  const grantable =
    addedIds(roleIds, currentRoles).every((r) => canGrantRole(me, r)) &&
    addedIds(groupIds, currentGroups).every((g) => canGrantGroup(me, g));
  if (!grantable) {
    return flashFail({ error: "You can only grant roles and groups whose permissions you hold yourself." });
  }
  if (leavesNoAdministrator({ kind: "user", userId: user.id, roleIds, groupIds })) {
    return flashFail({ error: "At least one user must keep the Administrator role." });
  }
  const res = await updateUser(params.id, data);
  if (!res.ok) return flashFail({ error: res.reason });
  setUserRoles(user.id, roleIds);
  setUserGroups(user.id, groupIds);
  return flashRedirect("/admin/users", "User saved");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>User not found</h1>
      <p style={{ color: "var(--admin-muted)" }}>{error instanceof Error ? error.message : "Error"}</p>
      <Link to="/admin/users" style={{ color: "var(--admin-accent)", fontWeight: 600 }}>
        ← Back to users
      </Link>
    </div>
  );
}
export function meta() {
  return [{ title: "Edit user | CMS Admin" }];
}

export default function EditUser() {
  const { user, isSelf, roles, groups, roleIds, groupIds } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  const fe = state?.fieldErrors ?? {};
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Edit user</h1>
        <Link to="/admin/users" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>
          ← All users
        </Link>
      </div>
      <div className="admin-panel" style={{ maxWidth: "640px" }}>
        <Form method="post" key={user.id} style={{ display: "grid", gap: ".7rem" }}>
          <input type="hidden" name="intent" value="save" />
          <Field label="Username">
            <input value={user.username} disabled className={`${input} bg-slate-100 text-slate-500`} />
          </Field>
          <Field label="Display name">
            <input name="displayName" defaultValue={user.displayName} required className={input} />
          </Field>
          {fe.displayName ? <ErrorNote>{fe.displayName[0]}</ErrorNote> : null}
          {isSelf ? (
            <p style={{ margin: 0, fontSize: ".85rem", color: "var(--admin-muted)" }}>
              This is your account: your email, roles, groups and password can only be changed by another
              administrator.
            </p>
          ) : null}
          <Field label="Email" hint="The 2FA sign-in code is sent here.">
            <input
              name="email"
              type="email"
              defaultValue={user.email ?? ""}
              required
              readOnly={isSelf}
              className={isSelf ? `${input} bg-slate-100 text-slate-500` : input}
            />
          </Field>
          {fe.email ? <ErrorNote>{fe.email[0]}</ErrorNote> : null}
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr" }}>
            <fieldset
              style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem" }}
            >
              <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase" }}>
                Roles
              </legend>
              <div style={{ display: "grid", gap: ".3rem" }}>
                {roles.map((r) => (
                  <label
                    key={r.id}
                    style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}
                  >
                    <input
                      type="checkbox"
                      name="roles"
                      value={r.id}
                      defaultChecked={roleIds.includes(r.id)}
                      disabled={isSelf}
                    />{" "}
                    {r.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset
              style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem" }}
            >
              <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase" }}>
                Groups
              </legend>
              <div style={{ display: "grid", gap: ".3rem" }}>
                {groups.length === 0 ? (
                  <span style={{ color: "var(--admin-muted)", fontSize: ".85rem" }}>No groups.</span>
                ) : (
                  groups.map((g) => (
                    <label
                      key={g.id}
                      style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}
                    >
                      <input
                        type="checkbox"
                        name="groups"
                        value={g.id}
                        defaultChecked={groupIds.includes(g.id)}
                        disabled={isSelf}
                      />{" "}
                      {g.name}
                    </label>
                  ))
                )}
              </div>
            </fieldset>
          </div>
          {isSelf ? null : (
            <Field label="New password" hint="Leave blank to keep the current password.">
              <input name="password" type="password" autoComplete="new-password" className={input} />
            </Field>
          )}
          {fe.password ? <ErrorNote>{fe.password[0]}</ErrorNote> : null}
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div>
            <button type="submit" className={primaryButton}>
              Save changes
            </button>
          </div>
        </Form>
      </div>
      {!isSelf ? (
        <Form method="post" style={{ marginTop: "1rem" }}>
          <input type="hidden" name="intent" value="delete" />
          <button type="submit" className={dangerButton}>
            Delete user
          </button>
        </Form>
      ) : null}
    </>
  );
}
