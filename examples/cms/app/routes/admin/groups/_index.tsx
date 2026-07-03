import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import {
  createGroup,
  deleteGroup,
  type Group,
  groupMemberCount,
  groupRoleIds,
  listGroups,
} from "../../../models/rbac.server.ts";
import {
  dangerButton,
  EmptyState,
  ErrorNote,
  Field,
  ghostButton,
  input,
  primaryButton,
} from "../../../ui.tsx";
import { GroupSchema, type NamedInput } from "../../../validation.ts";

type Row = Group & { members: number; roles: number };
type Data = { groups: Row[] };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "roles.manage");
  return {
    groups: listGroups().map((g) => ({
      ...g,
      members: groupMemberCount(g.id),
      roles: groupRoleIds(g.id).length,
    })),
  };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "roles.manage");
  if (String(formData.get("intent")) === "delete") {
    deleteGroup(String(formData.get("id") ?? ""));
    return flashRedirect("/admin/groups", "Group deleted");
  }
  let data: NamedInput;
  try {
    data = await validate<NamedInput>(GroupSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = createGroup(data);
  return res.id
    ? flashRedirect(`/admin/groups/${res.id}`, "Group created")
    : flashFail({ error: res.reason });
}

export function meta() {
  return [{ title: "Groups | CMS Admin" }];
}

export default function Groups() {
  const { groups } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
      <div className="admin-panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Groups</h2>
        {groups.length === 0 ? (
          <EmptyState>No groups yet — bundle roles and assign members to them.</EmptyState>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Members</th>
                <th style={{ width: "1%" }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={`/admin/groups/${g.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {g.name}
                    </Link>
                    {g.description ? (
                      <div style={{ color: "var(--admin-muted)", fontSize: ".8rem" }}>{g.description}</div>
                    ) : null}
                  </td>
                  <td>{g.roles}</td>
                  <td>{g.members}</td>
                  <td>
                    <div className="toolbar">
                      <Link to={`/admin/groups/${g.id}`} className={ghostButton}>
                        Edit
                      </Link>
                      <Form method="post" style={{ margin: 0 }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className={dangerButton}>
                          Delete
                        </button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="admin-panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>New group</h2>
        <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Name">
            <input name="name" required className={input} />
          </Field>
          <Field label="Description">
            <input name="description" className={input} />
          </Field>
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div>
            <button type="submit" className={primaryButton}>
              Create group
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
