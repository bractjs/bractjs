import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, HttpError, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import {
  type Group,
  getGroup,
  groupMemberIds,
  groupRoleIds,
  listRoles,
  type Role,
  setGroupMembers,
  setGroupRoles,
  updateGroup,
} from "../../../models/rbac.server.ts";
import { listUsers, type User } from "../../../models/users.server.ts";
import { ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";
import { GroupSchema, type NamedInput } from "../../../validation.ts";

type Data = { group: Group; roles: Role[]; users: User[]; roleIds: string[]; memberIds: string[] };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "roles.manage");
  const group = getGroup(params.id);
  if (!group) throw new HttpError(404, "Group not found.");
  return {
    group,
    roles: listRoles(),
    users: listUsers(),
    roleIds: groupRoleIds(group.id),
    memberIds: groupMemberIds(group.id),
  };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "roles.manage");
  const group = getGroup(params.id);
  if (!group) throw new HttpError(404, "Group not found.");
  let data: NamedInput;
  try {
    data = await validate<NamedInput>(GroupSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = updateGroup(group.id, data);
  if (!res.ok) return flashFail({ error: res.reason });
  setGroupRoles(group.id, formData.getAll("roles").map(String));
  setGroupMembers(group.id, formData.getAll("members").map(String));
  return flashRedirect("/admin/groups", "Group saved");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Group not found</h1>
      <p style={{ color: "var(--admin-muted)" }}>{error instanceof Error ? error.message : "Error"}</p>
      <Link to="/admin/groups" style={{ color: "var(--admin-accent)", fontWeight: 600 }}>
        ← Back to groups
      </Link>
    </div>
  );
}
export function meta() {
  return [{ title: "Edit group | CMS Admin" }];
}

export default function EditGroup() {
  const { group, roles, users, roleIds, memberIds } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>{group.name}</h1>
        <Link to="/admin/groups" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>
          ← All groups
        </Link>
      </div>
      <div className="admin-panel" style={{ maxWidth: "720px" }}>
        <Form method="post" key={group.id} style={{ display: "grid", gap: ".9rem" }}>
          <Field label="Name">
            <input name="name" defaultValue={group.name} required className={input} />
          </Field>
          <Field label="Description">
            <input name="description" defaultValue={group.description} className={input} />
          </Field>
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr" }}>
            <fieldset
              style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem" }}
            >
              <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase" }}>
                Roles granted
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
                Members
              </legend>
              <div style={{ display: "grid", gap: ".3rem", maxHeight: "16rem", overflow: "auto" }}>
                {users.map((u) => (
                  <label
                    key={u.id}
                    style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}
                  >
                    <input
                      type="checkbox"
                      name="members"
                      value={u.id}
                      defaultChecked={memberIds.includes(u.id)}
                    />{" "}
                    {u.displayName} <span style={{ color: "var(--admin-muted)" }}>@{u.username}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div>
            <button type="submit" className={primaryButton}>
              Save group
            </button>
          </div>
        </Form>
      </div>
    </>
  );
}
