// In-memory DB (NODE_ENV=test). Uses the seeded footer menu (`menus.location`
// is UNIQUE, so a test can't create a second one) and cleans up after itself.
import { expect, test } from "bun:test";
import { db } from "../db.server.ts";
import {
  addMenuItem,
  getMenuByLocation,
  menuItems,
  removeMenuItem,
  reorderMenuItems,
  resolvedMenu,
} from "../models/menus.server.ts";
import { createPage, deletePage } from "../models/pages.server.ts";

const rnd = () => crypto.randomUUID().slice(0, 8);
const page = (status: "draft" | "published", parentId: string | null = null) =>
  createPage({
    title: `P-${rnd()}`,
    slug: `p-${rnd()}`,
    body: "",
    status,
    parentId,
    featuredMediaId: null,
    menuOrder: 0,
    seoTitle: "",
    seoDescription: "",
  }).id!;
const slugOf = (id: string) =>
  db.query<{ slug: string }, [string]>("SELECT slug FROM pages WHERE id = ?").get(id)!.slug;

test("resolvedMenu hides items that point at unpublished pages, subtree included", () => {
  const footer = getMenuByLocation("footer")!;
  const draft = page("draft");
  const live = page("published");
  const draftItem = addMenuItem(footer.id, {
    label: "Draft",
    type: "page",
    pageId: draft,
    categoryId: null,
    url: null,
  });
  const liveItem = addMenuItem(footer.id, {
    label: "Live",
    type: "page",
    pageId: live,
    categoryId: null,
    url: null,
  });
  const childItem = addMenuItem(footer.id, {
    label: "Child",
    type: "page",
    pageId: live,
    categoryId: null,
    url: null,
  });
  // Nest the (published) child under the draft item.
  db.run("UPDATE menu_items SET parentId = ? WHERE id = ?", [draftItem.id, childItem.id]);
  try {
    const items = resolvedMenu("footer").items;
    const flat = (nodes: typeof items): string[] => nodes.flatMap((n) => [n.id, ...flat(n.children)]);
    const ids = flat(items);
    expect(ids).toContain(liveItem.id);
    expect(ids).not.toContain(draftItem.id);
    expect(ids).not.toContain(childItem.id);
    expect(items.find((n) => n.id === liveItem.id)!.href).toBe(`/${slugOf(live)}`);
  } finally {
    removeMenuItem(childItem.id);
    removeMenuItem(draftItem.id);
    removeMenuItem(liveItem.id);
    deletePage(draft);
    deletePage(live);
  }
});

test("reorderMenuItems refuses a layout that matches none of the menu's items", () => {
  const footer = getMenuByLocation("footer")!;
  const before = menuItems(footer.id);
  expect(before.length).toBeGreaterThan(0);
  expect(
    reorderMenuItems(footer.id, [{ id: "nope", parentId: null, position: 0, label: "x", cssClass: "" }]),
  ).toBe(false);
  expect(menuItems(footer.id)).toEqual(before);
  // A real layout is applied.
  expect(
    reorderMenuItems(
      footer.id,
      before.map((it) => ({
        id: it.id,
        parentId: it.parentId,
        position: it.position,
        label: it.label,
        cssClass: it.cssClass,
      })),
    ),
  ).toBe(true);
  expect(menuItems(footer.id)).toEqual(before);
});
