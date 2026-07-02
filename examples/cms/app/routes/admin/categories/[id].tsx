import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import {
  categoryDescendantIds,
  categoryTreeFlat,
  deleteCategory,
  getCategory,
  updateCategory,
  type Category,
  type CategoryNode,
} from "../../../models/categories.server.ts";
import { loadEntityFields, saveEntityFields, type EntityFieldsData } from "../../../models/fields.server.ts";
import { CategorySchema, type CategoryInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { CustomFields } from "../../../components/CustomFields.tsx";
import { dangerButton, ErrorNote, Field, input, primaryButton, select, textarea } from "../../../ui.tsx";

// Array, not a Set — loader data is JSON-serialized to the client (a Set becomes
// `{}`, so `.has` is undefined on hydration). See pages/[id].tsx.
type Data = { cat: Category; options: CategoryNode[]; blocked: string[]; customFields: EntityFieldsData };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "categories.manage");
  const cat = getCategory(params.id);
  if (!cat) throw new HttpError(404, "Category not found.");
  return { cat, options: categoryTreeFlat(), blocked: [...categoryDescendantIds(cat.id)], customFields: loadEntityFields("category", cat.id) };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "categories.manage");
  if (!getCategory(params.id)) throw new HttpError(404, "Category not found.");
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const res = deleteCategory(params.id);
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/categories", "Category deleted");
  }

  let data: CategoryInput;
  try {
    data = await validate<CategoryInput>(CategorySchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = updateCategory(params.id, data);
  if (!res.ok) return flashFail({ error: res.reason });
  saveEntityFields("category", params.id, formData);
  return flashRedirect("/admin/categories", "Category saved");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Category not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <Link to="/admin/categories" style={{ color: "var(--accent)", fontWeight: 600 }}>← Back to categories</Link>
    </div>
  );
}

export function meta() {
  return [{ title: "Edit category | CMS Admin" }];
}

export default function EditCategory() {
  const { cat, options, blocked, customFields } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Edit category</h1>
        <Link to="/admin/categories" style={{ color: "var(--accent)", textDecoration: "none" }}>← All categories</Link>
      </div>
      <div className="admin-panel" style={{ maxWidth: "640px" }}>
        <Form method="post" key={cat.id} style={{ display: "grid", gap: ".7rem" }}>
          <input type="hidden" name="intent" value="save" />
          <Field label="Name">
            <input name="name" defaultValue={cat.name} required className={input} />
          </Field>
          <Field label="Slug">
            <input name="slug" defaultValue={cat.slug} className={input} />
          </Field>
          <Field label="Parent">
            <select name="parentId" className={select} defaultValue={cat.parentId ?? ""}>
              <option value="">— none —</option>
              {options.filter((o) => !blocked.includes(o.id)).map((o) => (
                <option key={o.id} value={o.id}>{"  ".repeat(o.depth)}{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea name="description" defaultValue={cat.description} className={`${textarea} min-h-20`} />
          </Field>
          <Field label="SEO title" hint="Blank = the category name."><input name="seoTitle" defaultValue={cat.seoTitle} className={input} /></Field>
          <Field label="Meta description" hint="~155 chars."><textarea name="seoDescription" defaultValue={cat.seoDescription} className={`${textarea} min-h-20`} /></Field>
          <CustomFields data={customFields} />
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div className="toolbar">
            <button type="submit" className={primaryButton}>Save changes</button>
          </div>
        </Form>
      </div>
      <Form method="post" style={{ marginTop: "1rem", maxWidth: "640px" }}>
        <input type="hidden" name="intent" value="delete" />
        <button type="submit" className={dangerButton}>Delete category</button>
      </Form>
    </>
  );
}
