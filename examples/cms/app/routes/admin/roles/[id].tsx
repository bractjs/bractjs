import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { getRole, rolePermissions, setRolePermissions, updateRole, type Role } from "../../../models/rbac.server.ts";
import { PERMISSIONS, PERMISSION_GROUPS } from "../../../permissions.ts";
import { RoleSchema, type NamedInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { Badge, ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";

type Data = { role: Role; permissions: string[] };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "roles.manage");
  const role = getRole(params.id);
  if (!role) throw new HttpError(404, "Role not found.");
  return { role, permissions: rolePermissions(role.id) };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "roles.manage");
  const role = getRole(params.id);
  if (!role) throw new HttpError(404, "Role not found.");
  let data: NamedInput;
  try { data = await validate<NamedInput>(RoleSchema, formData); }
  catch (err) { return flashFail(await fromValidationError(err)); }
  const res = updateRole(role.id, data);
  if (!res.ok) return flashFail({ error: res.reason });
  if (!role.isSystem) setRolePermissions(role.id, formData.getAll("permissions").map(String));
  return flashRedirect("/admin/roles", "Role saved");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  return <div className="admin-panel"><h1 style={{ marginTop: 0 }}>Role not found</h1><p style={{ color: "var(--admin-muted)" }}>{error instanceof Error ? error.message : "Error"}</p><Link to="/admin/roles" style={{ color: "var(--admin-accent)", fontWeight: 600 }}>← Back to roles</Link></div>;
}
export function meta() { return [{ title: "Edit role | CMS Admin" }]; }

export default function EditRole() {
  const { role, permissions } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  const has = (p: string) => role.isSystem || permissions.includes(p);
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>{role.name}{role.isSystem ? <> <Badge tone="published">system</Badge></> : null}</h1>
        <Link to="/admin/roles" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>← All roles</Link>
      </div>
      <div className="admin-panel" style={{ maxWidth: "640px" }}>
        <Form method="post" key={role.id} style={{ display: "grid", gap: ".8rem" }}>
          <Field label="Name"><input name="name" defaultValue={role.name} required className={input} /></Field>
          <Field label="Description"><input name="description" defaultValue={role.description} className={input} /></Field>
          <div>
            <span style={{ fontWeight: 600, fontSize: ".9rem" }}>Permissions</span>
            {role.isSystem ? <p style={{ color: "var(--admin-muted)", fontSize: ".85rem", margin: ".3rem 0 0" }}>The Administrator role always has every permission.</p> : null}
            {PERMISSION_GROUPS.map((grp) => (
              <fieldset key={grp.label} style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem", margin: ".5rem 0 0" }}>
                <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>{grp.label}</legend>
                <div style={{ display: "grid", gap: ".3rem" }}>
                  {grp.items.map((p) => (
                    <label key={p} style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem", opacity: role.isSystem ? 0.6 : 1 }}>
                      <input type="checkbox" name="permissions" value={p} defaultChecked={has(p)} disabled={role.isSystem} /> {PERMISSIONS[p]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div><button type="submit" className={primaryButton}>Save role</button></div>
        </Form>
      </div>
    </>
  );
}
