import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import { createMenu, deleteMenu, listMenus, type Menu, menuItems } from "../../../models/menus.server.ts";
import {
  dangerButton,
  EmptyState,
  ErrorNote,
  Field,
  ghostButton,
  input,
  primaryButton,
  select,
} from "../../../ui.tsx";
import { type MenuInput, MenuSchema } from "../../../validation.ts";

type MenuRow = Menu & { count: number };
type Data = { menus: MenuRow[] };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "menus.manage");
  return { menus: listMenus().map((m) => ({ ...m, count: menuItems(m.id).length })) };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "menus.manage");
  if (String(formData.get("intent")) === "delete") {
    deleteMenu(String(formData.get("id") ?? ""));
    return flashRedirect("/admin/menus", "Menu deleted");
  }
  let data: MenuInput;
  try {
    data = await validate<MenuInput>(MenuSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = createMenu(data);
  if (!res.ok || !res.id) return flashFail({ error: res.reason });
  return flashRedirect(`/admin/menus/${res.id}`, "Menu created");
}

export function meta() {
  return [{ title: "Menus | CMS Admin" }];
}

export default function Menus() {
  const { menus } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  const usedLocations = new Set(menus.map((m) => m.location));
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Menus</h1>
      </div>
      <div style={{ display: "grid", gap: "1.2rem", maxWidth: "760px" }}>
        <div className="admin-panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Create menu</h2>
          {usedLocations.size >= 2 ? (
            <p style={{ color: "var(--muted)" }}>Both header and footer menus already exist.</p>
          ) : (
            <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
              <input type="hidden" name="intent" value="create" />
              <Field label="Name">
                <input name="name" required className={input} />
              </Field>
              <Field label="Location">
                <select
                  name="location"
                  className={select}
                  defaultValue={usedLocations.has("header") ? "footer" : "header"}
                >
                  {!usedLocations.has("header") ? <option value="header">Header</option> : null}
                  {!usedLocations.has("footer") ? <option value="footer">Footer</option> : null}
                </select>
              </Field>
              {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
              <div>
                <button type="submit" className={primaryButton}>
                  Create menu
                </button>
              </div>
            </Form>
          )}
        </div>

        {menus.length === 0 ? (
          <EmptyState>No menus yet.</EmptyState>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Items</th>
                <th style={{ width: "1%" }}></th>
              </tr>
            </thead>
            <tbody>
              {menus.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/admin/menus/${m.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {m.name}
                    </Link>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{m.location}</td>
                  <td style={{ color: "var(--muted)" }}>{m.count}</td>
                  <td>
                    <div className="toolbar">
                      <Link to={`/admin/menus/${m.id}`} className={ghostButton}>
                        Manage
                      </Link>
                      <Form method="post" style={{ margin: 0 }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={m.id} />
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
    </>
  );
}
