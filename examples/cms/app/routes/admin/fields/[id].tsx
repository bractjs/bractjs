import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import {
  addField, getGroup, listFields, moveField, removeField, updateGroup,
  type Field as CField, type FieldGroup,
} from "../../../models/fields.server.ts";
import { FieldGroupSchema, FieldSchema, FIELD_TARGETS, FIELD_KINDS, type FieldGroupInput, type FieldInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { Badge, EmptyState, ErrorNote, Field, dangerButton, ghostButton, input, primaryButton, select } from "../../../ui.tsx";

type Data = { group: FieldGroup; fields: CField[] };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "fields.manage");
  const group = getGroup(params.id);
  if (!group) throw new HttpError(404, "Field group not found.");
  return { group, fields: listFields(group.id) };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "fields.manage");
  const group = getGroup(params.id);
  if (!group) throw new HttpError(404, "Field group not found.");
  const intent = String(formData.get("intent") ?? "");
  const to = `/admin/fields/${group.id}`;

  if (intent === "remove") { removeField(String(formData.get("fieldId") ?? "")); return flashRedirect(to, "Field removed"); }
  if (intent === "up" || intent === "down") { moveField(String(formData.get("fieldId") ?? ""), intent); return flashRedirect(to, "Field reordered"); }
  if (intent === "group") {
    let data: FieldGroupInput;
    try { data = await validate<FieldGroupInput>(FieldGroupSchema, formData); }
    catch (err) { return flashFail(await fromValidationError(err)); }
    updateGroup(group.id, data);
    return flashRedirect(to, "Field group saved");
  }
  // add field
  let data: FieldInput;
  try { data = await validate<FieldInput>(FieldSchema, formData); }
  catch (err) { return flashFail(await fromValidationError(err)); }
  const res = addField(group.id, data);
  if (!res.ok) return flashFail({ error: res.reason, fieldErrors: { name: [res.reason!] } });
  return flashRedirect(to, "Field added");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Field group not found</h1>
      <p style={{ color: "var(--admin-muted)" }}>{msg}</p>
      <Link to="/admin/fields" style={{ color: "var(--admin-accent)", fontWeight: 600 }}>← Back to fields</Link>
    </div>
  );
}

export function meta() { return [{ title: "Edit field group | CMS Admin" }]; }

export default function EditGroup() {
  const { group, fields } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  const fe = state?.fieldErrors ?? {};
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>{group.name}</h1>
        <Link to="/admin/fields" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>← All groups</Link>
      </div>
      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr 340px", alignItems: "start" }}>
        <div className="admin-panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Fields</h2>
          {fields.length === 0 ? <EmptyState>No fields yet — add one on the right.</EmptyState> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".4rem" }}>
              {fields.map((f, i) => (
                <li key={f.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".45rem .6rem" }}>
                  <span style={{ flex: 1 }}>
                    <strong>{f.label}</strong>
                    <code style={{ color: "var(--admin-muted)", marginLeft: ".4rem", fontSize: ".78rem" }}>{f.name}</code>
                  </span>
                  <Badge tone="muted">{f.type}</Badge>
                  {f.repeatable ? <Badge tone="published">repeat</Badge> : null}
                  <Form method="post" style={{ margin: 0 }}><input type="hidden" name="intent" value="up" /><input type="hidden" name="fieldId" value={f.id} /><button type="submit" disabled={i === 0} className={ghostButton} aria-label="Move up">↑</button></Form>
                  <Form method="post" style={{ margin: 0 }}><input type="hidden" name="intent" value="down" /><input type="hidden" name="fieldId" value={f.id} /><button type="submit" disabled={i === fields.length - 1} className={ghostButton} aria-label="Move down">↓</button></Form>
                  <Form method="post" style={{ margin: 0 }}><input type="hidden" name="intent" value="remove" /><input type="hidden" name="fieldId" value={f.id} /><button type="submit" className={dangerButton} aria-label="Remove">✕</button></Form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: "grid", gap: "1.2rem" }}>
          <div className="admin-panel">
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Add field</h2>
            <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
              <input type="hidden" name="intent" value="add" />
              <Field label="Label"><input name="label" required className={input} /></Field>
              <Field label="Key" hint="Blank = from label. Lowercase, letters/numbers/underscores."><input name="name" className={input} /></Field>
              {fe.name ? <ErrorNote>{fe.name[0]}</ErrorNote> : null}
              <Field label="Type">
                <select name="type" className={select} defaultValue="text">
                  {FIELD_KINDS.map((t) => <option key={t} value={t}>{({ text: "Text", image: "Image", post: "Post link", page: "Page link", category: "Category link" } as const)[t]}</option>)}
                </select>
              </Field>
              <label style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}>
                <input type="checkbox" name="repeatable" /> Repeatable (allow multiple values)
              </label>
              <div><button type="submit" className={primaryButton}>Add field</button></div>
            </Form>
          </div>
          <div className="admin-panel">
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Group settings</h2>
            <Form method="post" key={group.id} style={{ display: "grid", gap: ".7rem" }}>
              <input type="hidden" name="intent" value="group" />
              <Field label="Name"><input name="name" defaultValue={group.name} required className={input} /></Field>
              <Field label="Applies to">
                <select name="target" defaultValue={group.target} className={select}>
                  {FIELD_TARGETS.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
                </select>
              </Field>
              <div><button type="submit" className={ghostButton}>Save group</button></div>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}
