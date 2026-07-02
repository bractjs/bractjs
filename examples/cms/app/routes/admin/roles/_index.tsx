import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { createRole, deleteRole, listRoles, rolePermissions, type Role } from "../../../models/rbac.server.ts";
import { RoleSchema, type NamedInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { Badge, EmptyState, ErrorNote, Field, ghostButton, dangerButton, input, primaryButton } from "../../../ui.tsx";

type Row = Role & { perms: number };
type Data = { roles: Row[] };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "roles.manage");
  return { roles: listRoles().map((r) => ({ ...r, perms: rolePermissions(r.id).length })) };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "roles.manage");
  if (String(formData.get("intent")) === "delete") {
    const res = deleteRole(String(formData.get("id") ?? ""));
    return res.ok ? flashRedirect("/admin/roles", "Role deleted") : flashFail({ error: res.reason });
  }
  let data: NamedInput;
  try { data = await validate<NamedInput>(RoleSchema, formData); }
  catch (err) { return flashFail(await fromValidationError(err)); }
  const res = createRole(data);
  return res.id ? flashRedirect(`/admin/roles/${res.id}`, "Role created") : flashFail({ error: res.reason });
}

export function meta() { return [{ title: "Roles | CMS Admin" }]; }

export default function Roles() {
  const { roles } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
      <div className="admin-panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Roles</h2>
        {roles.length === 0 ? <EmptyState>No roles yet.</EmptyState> : (
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Permissions</th><th style={{ width: "1%" }}></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/admin/roles/${r.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>{r.name}</Link>
                    {r.isSystem ? <> <Badge tone="published">system</Badge></> : null}
                    {r.description ? <div style={{ color: "var(--admin-muted)", fontSize: ".8rem" }}>{r.description}</div> : null}
                  </td>
                  <td>{r.isSystem ? "all" : r.perms}</td>
                  <td>
                    <div className="toolbar">
                      <Link to={`/admin/roles/${r.id}`} className={ghostButton}>Edit</Link>
                      {!r.isSystem ? (
                        <Form method="post" style={{ margin: 0 }}>
                          <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={r.id} />
                          <button type="submit" className={dangerButton}>Delete</button>
                        </Form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="admin-panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>New role</h2>
        <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Name"><input name="name" required className={input} /></Field>
          <Field label="Description"><input name="description" className={input} /></Field>
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div><button type="submit" className={primaryButton}>Create role</button></div>
        </Form>
      </div>
    </div>
  );
}
