import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { loginCookie, requirePermission } from "../../../auth.server.ts";
import { deleteUser, getUserById, updateUser, type User } from "../../../models/users.server.ts";
import {
  listRoles, listGroups, userRoleIds, userGroupIds, setUserRoles, setUserGroups,
  roleByName, directRoleMemberCount, type Role, type Group,
} from "../../../models/rbac.server.ts";
import { UserEditSchema, type UserEditInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { dangerButton, ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";

type Data = { user: User; isSelf: boolean; roles: Role[]; groups: Group[]; roleIds: string[]; groupIds: string[] };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  const me = await requirePermission(request, "users.manage");
  const user = getUserById(params.id);
  if (!user) throw new HttpError(404, "User not found.");
  return { user, isSelf: me.id === user.id, roles: listRoles(), groups: listGroups(), roleIds: userRoleIds(user.id), groupIds: userGroupIds(user.id) };
}

// Never let the last directly-assigned Administrator be removed or deleted.
function lastAdminBlocks(userId: string, keepsAdmin: boolean): boolean {
  const admin = roleByName("Administrator");
  if (!admin) return false;
  return userRoleIds(userId).includes(admin.id) && !keepsAdmin && directRoleMemberCount(admin.id) <= 1;
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  const me = await requirePermission(request, "users.manage");
  const user = getUserById(params.id);
  if (!user) throw new HttpError(404, "User not found.");

  if (String(formData.get("intent")) === "delete") {
    if (me.id === user.id) return flashFail({ error: "You can’t delete your own account while signed in." });
    if (lastAdminBlocks(user.id, false)) return flashFail({ error: "Can’t delete the last administrator." });
    const res = deleteUser(params.id);
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/users", "User deleted");
  }

  let data: UserEditInput;
  try { data = await validate<UserEditInput>(UserEditSchema, formData); }
  catch (err) { return flashFail(await fromValidationError(err)); }
  const roleIds = formData.getAll("roles").map(String);
  const admin = roleByName("Administrator");
  if (admin && lastAdminBlocks(user.id, roleIds.includes(admin.id))) {
    return flashFail({ error: "At least one user must keep the Administrator role." });
  }
  const res = await updateUser(params.id, data);
  if (!res.ok) return flashFail({ error: res.reason });
  setUserRoles(user.id, roleIds);
  setUserGroups(user.id, formData.getAll("groups").map(String));
  const response = await flashRedirect("/admin/users", "User saved");
  // Changing a password bumps the user's session epoch, revoking their existing
  // cookies. If that user is ME, re-issue my cookie so I stay signed in (my
  // OTHER sessions remain revoked); for anyone else, leave them logged out.
  if (me.id === user.id && data.password.length > 0) {
    response.headers.append("Set-Cookie", await loginCookie(me));
  }
  return response;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  return <div className="admin-panel"><h1 style={{ marginTop: 0 }}>User not found</h1><p style={{ color: "var(--admin-muted)" }}>{error instanceof Error ? error.message : "Error"}</p><Link to="/admin/users" style={{ color: "var(--admin-accent)", fontWeight: 600 }}>← Back to users</Link></div>;
}
export function meta() { return [{ title: "Edit user | CMS Admin" }]; }

export default function EditUser() {
  const { user, isSelf, roles, groups, roleIds, groupIds } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  const fe = state?.fieldErrors ?? {};
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Edit user</h1>
        <Link to="/admin/users" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>← All users</Link>
      </div>
      <div className="admin-panel" style={{ maxWidth: "640px" }}>
        <Form method="post" key={user.id} style={{ display: "grid", gap: ".7rem" }}>
          <input type="hidden" name="intent" value="save" />
          <Field label="Username"><input value={user.username} disabled className={`${input} bg-slate-100 text-slate-500`} /></Field>
          <Field label="Display name"><input name="displayName" defaultValue={user.displayName} required className={input} /></Field>
          {fe.displayName ? <ErrorNote>{fe.displayName[0]}</ErrorNote> : null}
          <Field label="Email" hint="The 2FA sign-in code is sent here."><input name="email" type="email" defaultValue={user.email ?? ""} required className={input} /></Field>
          {fe.email ? <ErrorNote>{fe.email[0]}</ErrorNote> : null}
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr" }}>
            <fieldset style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem" }}>
              <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase" }}>Roles</legend>
              <div style={{ display: "grid", gap: ".3rem" }}>
                {roles.map((r) => (
                  <label key={r.id} style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}>
                    <input type="checkbox" name="roles" value={r.id} defaultChecked={roleIds.includes(r.id)} /> {r.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem" }}>
              <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase" }}>Groups</legend>
              <div style={{ display: "grid", gap: ".3rem" }}>
                {groups.length === 0 ? <span style={{ color: "var(--admin-muted)", fontSize: ".85rem" }}>No groups.</span> : groups.map((g) => (
                  <label key={g.id} style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}>
                    <input type="checkbox" name="groups" value={g.id} defaultChecked={groupIds.includes(g.id)} /> {g.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <Field label="New password" hint="Leave blank to keep the current password."><input name="password" type="password" autoComplete="new-password" className={input} /></Field>
          {fe.password ? <ErrorNote>{fe.password[0]}</ErrorNote> : null}
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div><button type="submit" className={primaryButton}>Save changes</button></div>
        </Form>
      </div>
      {!isSelf ? (
        <Form method="post" style={{ marginTop: "1rem" }}>
          <input type="hidden" name="intent" value="delete" />
          <button type="submit" className={dangerButton}>Delete user</button>
        </Form>
      ) : null}
    </>
  );
}
