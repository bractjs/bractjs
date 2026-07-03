import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import {
  createGroup,
  deleteGroup,
  type FieldGroup,
  listFields,
  listGroups,
} from "../../../models/fields.server.ts";
import {
  Badge,
  dangerButton,
  EmptyState,
  ErrorNote,
  Field,
  ghostButton,
  input,
  primaryButton,
  select,
} from "../../../ui.tsx";
import { FIELD_TARGETS, type FieldGroupInput, FieldGroupSchema } from "../../../validation.ts";

type Row = FieldGroup & { count: number };
type Data = { groups: Row[] };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "fields.manage");
  return { groups: listGroups().map((g) => ({ ...g, count: listFields(g.id).length })) };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "fields.manage");
  if (String(formData.get("intent")) === "delete") {
    deleteGroup(String(formData.get("id") ?? ""));
    return flashRedirect("/admin/fields", "Field group deleted");
  }
  let data: FieldGroupInput;
  try {
    data = await validate<FieldGroupInput>(FieldGroupSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = createGroup(data);
  return res.id
    ? flashRedirect(`/admin/fields/${res.id}`, "Field group created")
    : flashFail({ error: "Could not create group." });
}

export function meta() {
  return [{ title: "Custom fields | CMS Admin" }];
}

export default function Fields() {
  const { groups } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
      <div className="admin-panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Field groups</h2>
        {groups.length === 0 ? (
          <EmptyState>
            No field groups yet — create one to add custom fields to posts, pages or categories.
          </EmptyState>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Applies to</th>
                <th>Fields</th>
                <th style={{ width: "1%" }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={`/admin/fields/${g.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {g.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone="muted">{g.target}</Badge>
                  </td>
                  <td>{g.count}</td>
                  <td>
                    <div className="toolbar">
                      <Link to={`/admin/fields/${g.id}`} className={ghostButton}>
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
          <Field label="Applies to">
            <select name="target" className={select} defaultValue="post">
              {FIELD_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
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
