import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import {
  type CategoryNode,
  categoryTreeFlat,
  createCategory,
  deleteCategory,
} from "../../../models/categories.server.ts";
import {
  dangerButton,
  EmptyState,
  ErrorNote,
  Field,
  ghostButton,
  input,
  primaryButton,
  select,
  textarea,
} from "../../../ui.tsx";
import { type CategoryInput, CategorySchema } from "../../../validation.ts";

export async function loader({ request }: LoaderArgs): Promise<{ cats: CategoryNode[] }> {
  await requirePermission(request, "categories.manage");
  return { cats: categoryTreeFlat() };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "categories.manage");
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const res = deleteCategory(String(formData.get("id") ?? ""));
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/categories", "Category deleted");
  }

  // create
  let data: CategoryInput;
  try {
    data = await validate<CategoryInput>(CategorySchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = createCategory(data);
  if (!res.ok) return flashFail({ error: res.reason, fieldErrors: { slug: [res.reason!] } });
  return flashRedirect("/admin/categories", "Category created");
}

export function meta() {
  return [{ title: "Categories | CMS Admin" }];
}

export default function Categories() {
  const { cats } = useLoaderData<{ cats: CategoryNode[] }>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Categories</h1>
      </div>

      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr", maxWidth: "880px" }}>
        <div className="admin-panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Add category</h2>
          <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
            <input type="hidden" name="intent" value="create" />
            <Field label="Name">
              <input name="name" required className={input} />
            </Field>
            <Field label="Slug" hint="Leave blank to derive from the name.">
              <input name="slug" className={input} />
            </Field>
            <Field label="Parent">
              <select name="parentId" className={select} defaultValue="">
                <option value="">— none —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {" ".repeat(c.depth * 2)}
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea name="description" className={`${textarea} min-h-16`} />
            </Field>
            {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
            <div>
              <button type="submit" className={primaryButton}>
                Add category
              </button>
            </div>
          </Form>
        </div>

        <div>
          {cats.length === 0 ? (
            <EmptyState>No categories yet.</EmptyState>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th style={{ width: "1%" }}></th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span style={{ color: "var(--muted)" }}>{"— ".repeat(c.depth)}</span>
                      <Link
                        to={`/admin/categories/${c.id}`}
                        style={{ fontWeight: 600, textDecoration: "none" }}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <code>{c.slug}</code>
                    </td>
                    <td>
                      <div className="toolbar">
                        <Link to={`/admin/categories/${c.id}`} className={ghostButton}>
                          Edit
                        </Link>
                        <Form method="post" style={{ margin: 0 }}>
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={c.id} />
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
      </div>
    </>
  );
}
