import { db, newId, nowTs, tx } from "../db.server.ts";

export type MenuLocation = "header" | "footer";

export type Menu = {
  id: string;
  name: string;
  location: MenuLocation;
  menuClass: string;
  submenuClass: string;
  itemClass: string;
  createdAt: number;
};
export type MenuItem = {
  id: string;
  menuId: string;
  label: string;
  type: "page" | "category" | "custom";
  pageId: string | null;
  categoryId: string | null;
  url: string | null;
  parentId: string | null;
  cssClass: string;
  position: number;
};
/** A menu item with its children — admin editor + public render. */
export type MenuItemNode = MenuItem & { children: MenuItemNode[] };
/** Resolved (href computed) tree for public rendering, plus the menu's CSS classes. */
export type MenuNode = { id: string; label: string; href: string; cssClass: string; children: MenuNode[] };
export type ResolvedMenu = { menuClass: string; submenuClass: string; itemClass: string; items: MenuNode[] };

export function listMenus(): Menu[] {
  return db.query<Menu, []>("SELECT * FROM menus ORDER BY location ASC").all();
}

export function getMenu(id: string): Menu | null {
  return db.query<Menu, [string]>("SELECT * FROM menus WHERE id = ?").get(id) ?? null;
}

export function getMenuByLocation(location: MenuLocation): Menu | null {
  return db.query<Menu, [string]>("SELECT * FROM menus WHERE location = ?").get(location) ?? null;
}

export function createMenu(input: { name: string; location: MenuLocation }): {
  ok: boolean;
  reason?: string;
  id?: string;
} {
  if (getMenuByLocation(input.location))
    return { ok: false, reason: `A ${input.location} menu already exists.` };
  const id = newId();
  db.run("INSERT INTO menus (id, name, location, createdAt) VALUES (?,?,?,?)", [
    id,
    input.name,
    input.location,
    nowTs(),
  ]);
  return { ok: true, id };
}

export function deleteMenu(id: string): boolean {
  return db.run("DELETE FROM menus WHERE id = ?", [id]).changes > 0;
}

export function menuItems(menuId: string): MenuItem[] {
  return db
    .query<MenuItem, [string]>("SELECT * FROM menu_items WHERE menuId = ? ORDER BY position ASC")
    .all(menuId);
}

export function addMenuItem(
  menuId: string,
  input: {
    label: string;
    type: MenuItem["type"];
    pageId: string | null;
    categoryId: string | null;
    url: string | null;
  },
): MenuItem {
  // New items land at the end of the top level; nest/reorder happens in the tree editor.
  const max = db
    .query<{ m: number | null }, [string]>(
      "SELECT MAX(position) AS m FROM menu_items WHERE menuId = ? AND parentId IS NULL",
    )
    .get(menuId)?.m;
  const id = newId();
  db.run(
    "INSERT INTO menu_items (id, menuId, label, type, pageId, categoryId, url, parentId, cssClass, position) VALUES (?,?,?,?,?,?,?,NULL,'',?)",
    [id, menuId, input.label, input.type, input.pageId, input.categoryId, input.url, (max ?? -1) + 1],
  );
  return db.query<MenuItem, [string]>("SELECT * FROM menu_items WHERE id = ?").get(id)!;
}

export function removeMenuItem(itemId: string): boolean {
  return db.run("DELETE FROM menu_items WHERE id = ?", [itemId]).changes > 0;
}

export function updateMenuSettings(
  menuId: string,
  input: { menuClass: string; submenuClass: string; itemClass: string },
): void {
  db.run("UPDATE menus SET menuClass = ?, submenuClass = ?, itemClass = ? WHERE id = ?", [
    input.menuClass,
    input.submenuClass,
    input.itemClass,
    menuId,
  ]);
}

/** Build the nested item tree for a menu (ordered by position at each level). */
export function menuTree(menuId: string): MenuItemNode[] {
  const flat = db
    .query<MenuItem, [string]>("SELECT * FROM menu_items WHERE menuId = ? ORDER BY position ASC")
    .all(menuId);
  const byId = new Map<string, MenuItemNode>(flat.map((it) => [it.id, { ...it, children: [] }]));
  const roots: MenuItemNode[] = [];
  for (const it of flat) {
    const node = byId.get(it.id)!;
    const parent = it.parentId ? byId.get(it.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Replace a menu's item structure from the tree editor: delete items no longer
 * present, then re-parent / re-order / re-label the rest. `parentId` is validated
 * to belong to this menu (or null), so a payload can't move items across menus.
 */
export function reorderMenuItems(
  menuId: string,
  nodes: Array<{ id: string; parentId: string | null; position: number; label: string; cssClass: string }>,
): void {
  const owned = new Set(
    db
      .query<{ id: string }, [string]>("SELECT id FROM menu_items WHERE menuId = ?")
      .all(menuId)
      .map((r) => r.id),
  );
  const keep = new Set(nodes.map((n) => n.id).filter((id) => owned.has(id)));
  // Safety: a payload that matches none of this menu's items is malformed —
  // never let it wipe the menu. (Empty a menu by deleting the menu itself.)
  if (owned.size > 0 && keep.size === 0) return;
  tx(() => {
    for (const id of owned) if (!keep.has(id)) db.run("DELETE FROM menu_items WHERE id = ?", [id]);
    for (const n of nodes) {
      if (!owned.has(n.id)) continue;
      const parentId = n.parentId && keep.has(n.parentId) ? n.parentId : null;
      db.run(
        "UPDATE menu_items SET parentId = ?, position = ?, label = ?, cssClass = ? WHERE id = ? AND menuId = ?",
        [parentId, n.position, n.label, n.cssClass, n.id, menuId],
      );
    }
  });
}

function hrefFor(it: MenuItem): string {
  if (it.type === "custom") return it.url || "#";
  if (it.type === "category") {
    const slug = db
      .query<{ slug: string }, [string]>("SELECT slug FROM categories WHERE id = ?")
      .get(it.categoryId ?? "")?.slug;
    return slug ? `/category/${slug}` : "#";
  }
  return it.pageId ? (pagePath(it.pageId) ?? "#") : "#";
}

/** Resolve a location's nested items + the menu's CSS classes for public rendering. */
export function resolvedMenu(location: MenuLocation): ResolvedMenu {
  const menu = getMenuByLocation(location);
  if (!menu) return { menuClass: "", submenuClass: "", itemClass: "", items: [] };
  const resolve = (nodes: MenuItemNode[]): MenuNode[] =>
    nodes.map((it) => ({
      id: it.id,
      label: it.label,
      href: hrefFor(it),
      cssClass: it.cssClass,
      children: resolve(it.children),
    }));
  return {
    menuClass: menu.menuClass,
    submenuClass: menu.submenuClass,
    itemClass: menu.itemClass,
    items: resolve(menuTree(menu.id)),
  };
}

/** Build a page's full slug path by walking parents (kept here to avoid a model cycle). */
function pagePath(pageId: string): string | null {
  const slugs: string[] = [];
  const q = db.query<{ slug: string; parentId: string | null }, [string]>(
    "SELECT slug, parentId FROM pages WHERE id = ?",
  );
  let current = q.get(pageId) ?? null;
  let guard = 0;
  while (current && guard++ < 50) {
    slugs.unshift(current.slug);
    current = current.parentId ? (q.get(current.parentId) ?? null) : null;
  }
  return slugs.length ? `/${slugs.join("/")}` : null;
}
