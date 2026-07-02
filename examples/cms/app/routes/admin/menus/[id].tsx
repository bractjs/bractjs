import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, HttpError, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { type EditorNode, MenuTreeEditor } from "../../../components/MenuTreeEditor.tsx";
import { flashFail, flashStay } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import { type CategoryNode, categoryTreeFlat } from "../../../models/categories.server.ts";
import {
  addMenuItem,
  getMenu,
  type Menu,
  type MenuItemNode,
  menuTree,
  reorderMenuItems,
  updateMenuSettings,
} from "../../../models/menus.server.ts";
import { type PageNode, pageTreeFlat } from "../../../models/pages.server.ts";
import { ErrorNote, Field, ghostButton, input, primaryButton, select } from "../../../ui.tsx";
import { type MenuItemInput, MenuItemSchema } from "../../../validation.ts";

const toEditor = (ns: MenuItemNode[]): EditorNode[] =>
  ns.map((n) => ({
    id: n.id,
    label: n.label,
    cssClass: n.cssClass,
    badge: n.type === "custom" ? `custom${n.url ? ` · ${n.url}` : ""}` : n.type,
    children: toEditor(n.children),
  }));

type Data = { menu: Menu; items: EditorNode[]; pages: PageNode[]; categories: CategoryNode[] };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "menus.manage");
  const menu = getMenu(params.id);
  if (!menu) throw new HttpError(404, "Menu not found.");
  return { menu, items: toEditor(menuTree(menu.id)), pages: pageTreeFlat(), categories: categoryTreeFlat() };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "menus.manage");
  const menu = getMenu(params.id);
  if (!menu) throw new HttpError(404, "Menu not found.");
  const intent = String(formData.get("intent") ?? "");

  if (intent === "reorder") {
    try {
      const raw = JSON.parse(String(formData.get("layout") ?? "[]")) as unknown[];
      const nodes = (Array.isArray(raw) ? raw : []).map((n) => {
        const o = n as Record<string, unknown>;
        return {
          id: String(o.id),
          parentId: o.parentId ? String(o.parentId) : null,
          position: Number(o.position) || 0,
          label: String(o.label ?? ""),
          cssClass: String(o.cssClass ?? ""),
        };
      });
      reorderMenuItems(menu.id, nodes);
    } catch {
      return flashFail({ error: "Couldn’t save the menu layout." });
    }
    return flashStay("Menu layout saved");
  }
  if (intent === "settings") {
    updateMenuSettings(menu.id, {
      menuClass: String(formData.get("menuClass") ?? "").trim(),
      submenuClass: String(formData.get("submenuClass") ?? "").trim(),
      itemClass: String(formData.get("itemClass") ?? "").trim(),
    });
    return flashStay("Menu classes saved");
  }
  let data: MenuItemInput;
  try {
    data = await validate<MenuItemInput>(MenuItemSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  addMenuItem(menu.id, data);
  return flashStay("Menu item added");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Menu not found</h1>
      <p style={{ color: "var(--admin-muted)" }}>{error instanceof Error ? error.message : "Error"}</p>
      <Link to="/admin/menus" style={{ color: "var(--admin-accent)", fontWeight: 600 }}>
        ← Back to menus
      </Link>
    </div>
  );
}

export function meta() {
  return [{ title: "Manage menu | CMS Admin" }];
}

export default function MenuManager() {
  const { menu, items, pages, categories } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <div style={{ display: "flex", gap: ".6rem", alignItems: "baseline" }}>
          <h1 style={{ margin: 0 }}>{menu.name}</h1>
          <span style={{ color: "var(--admin-muted)", textTransform: "capitalize" }}>
            {menu.location} menu
          </span>
        </div>
        <Link to="/admin/menus" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>
          ← All menus
        </Link>
      </div>

      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
        <div className="admin-panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Items</h2>
          <MenuTreeEditor items={items} />
        </div>

        <div style={{ display: "grid", gap: "1.2rem" }}>
          <div className="admin-panel">
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Add item</h2>
            <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
              <input type="hidden" name="intent" value="add" />
              <Field label="Label">
                <input name="label" required className={input} />
              </Field>
              <Field label="Type">
                <select name="type" className={select} defaultValue="page">
                  <option value="page">Page</option>
                  <option value="category">Category</option>
                  <option value="custom">Custom URL</option>
                </select>
              </Field>
              <Field label="Page (if type = page)">
                <select name="pageId" className={select} defaultValue="">
                  <option value="">—</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {"  ".repeat(p.depth)}
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category (if type = category)">
                <select name="categoryId" className={select} defaultValue="">
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(c.depth)}
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="URL (if type = custom)">
                <input name="url" placeholder="/contact or https://…" className={input} />
              </Field>
              {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
              <div>
                <button type="submit" className={primaryButton}>
                  Add item
                </button>
              </div>
            </Form>
          </div>

          <div className="admin-panel">
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>CSS classes</h2>
            <Form method="post" key={menu.id} style={{ display: "grid", gap: ".7rem" }}>
              <input type="hidden" name="intent" value="settings" />
              <Field label="Main menu class" hint="On the root <ul>.">
                <input name="menuClass" defaultValue={menu.menuClass} className={input} />
              </Field>
              <Field label="Sub-menu class" hint="On every nested <ul>.">
                <input name="submenuClass" defaultValue={menu.submenuClass} className={input} />
              </Field>
              <Field label="Item class" hint="On every <li>; a per-item class adds to it.">
                <input name="itemClass" defaultValue={menu.itemClass} className={input} />
              </Field>
              <div>
                <button type="submit" className={ghostButton}>
                  Save classes
                </button>
              </div>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}
