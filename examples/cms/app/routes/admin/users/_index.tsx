import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { type AdminUser, requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import type { FormState } from "../../../form.ts";
import {
  directRoleMemberCount,
  roleByName,
  userRoleIds,
  userRoleNames,
} from "../../../models/rbac.server.ts";
import { deleteUser, listUsers, type User } from "../../../models/users.server.ts";
import { Badge, dangerButton, ErrorNote, ghostButton, primaryButton } from "../../../ui.tsx";

type Row = User & { roleNames: string[] };
type Data = { users: Row[]; me: string };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  const me = await requirePermission(request, "users.manage");
  return { users: listUsers().map((u) => ({ ...u, roleNames: userRoleNames(u.id) })), me: me.id };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  const me: AdminUser = await requirePermission(request, "users.manage");
  if (String(formData.get("intent")) === "delete") {
    const id = String(formData.get("id") ?? "");
    if (id === me.id) return flashFail({ error: "You can’t delete your own account while signed in." });
    const admin = roleByName("Administrator");
    if (admin && userRoleIds(id).includes(admin.id) && directRoleMemberCount(admin.id) <= 1)
      return flashFail({ error: "Can’t delete the last administrator." });
    const res = deleteUser(id);
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/users", "User deleted");
  }
  return {};
}

export function meta() {
  return [{ title: "Users | CMS Admin" }];
}

export default function Users() {
  const { users, me } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Users</h1>
        <Link to="/admin/users/new" className={primaryButton}>
          New user
        </Link>
      </div>
      {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email (2FA)</th>
            <th>Roles</th>
            <th>Sign-in</th>
            <th style={{ width: "1%" }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <Link to={`/admin/users/${u.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                  {u.displayName}
                </Link>{" "}
                <code style={{ color: "var(--muted)" }}>@{u.username}</code>
                {u.id === me ? (
                  <>
                    {" "}
                    <Badge tone="muted">you</Badge>
                  </>
                ) : null}
              </td>
              <td>{u.email ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
              <td>
                {u.roleNames.length ? (
                  <span style={{ display: "inline-flex", gap: ".3rem", flexWrap: "wrap" }}>
                    {u.roleNames.map((n) => (
                      <Badge key={n} tone={n === "Administrator" ? "published" : "muted"}>
                        {n}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>—</span>
                )}
              </td>
              <td>
                <Badge tone="muted">{u.provider}</Badge>
              </td>
              <td>
                <div className="toolbar">
                  <Link to={`/admin/users/${u.id}`} className={ghostButton}>
                    Edit
                  </Link>
                  {u.id !== me ? (
                    <Form method="post" style={{ margin: 0 }}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" className={dangerButton}>
                        Delete
                      </button>
                    </Form>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
