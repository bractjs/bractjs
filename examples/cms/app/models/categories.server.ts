import { db, newId, nowTs } from "../db.server.ts";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  seoTitle: string;
  seoDescription: string;
  createdAt: number;
};

export type CategoryNode = Category & { depth: number; children: CategoryNode[] };

export function listCategories(): Category[] {
  return db.query<Category, []>("SELECT * FROM categories ORDER BY name ASC").all();
}

export function getCategory(id: string): Category | null {
  return db.query<Category, [string]>("SELECT * FROM categories WHERE id = ?").get(id) ?? null;
}

export function getCategoryBySlug(slug: string): Category | null {
  return db.query<Category, [string]>("SELECT * FROM categories WHERE slug = ?").get(slug) ?? null;
}

/** Build the nested tree (with depth) from the flat list, in JS. */
export function categoryTree(): CategoryNode[] {
  const flat = listCategories();
  const byId = new Map<string, CategoryNode>();
  for (const c of flat) byId.set(c.id, { ...c, depth: 0, children: [] });
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const assignDepth = (nodes: CategoryNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    }
  };
  assignDepth(roots, 0);
  return roots;
}

/** Flattened tree (preorder) — handy for indented <select>/table rendering. */
export function categoryTreeFlat(): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(categoryTree());
  return out;
}

export function categoryAncestors(id: string): Category[] {
  const chain: Category[] = [];
  let current = getCategory(id);
  while (current?.parentId) {
    const parent = getCategory(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/** ids of `id` plus all its descendants — used to forbid cyclic parenting. */
export function categoryDescendantIds(id: string): Set<string> {
  const ids = new Set<string>([id]);
  const children = db.query<{ id: string }, [string]>("SELECT id FROM categories WHERE parentId = ?");
  const walk = (pid: string) => {
    for (const row of children.all(pid)) {
      if (!ids.has(row.id)) {
        ids.add(row.id);
        walk(row.id);
      }
    }
  };
  walk(id);
  return ids;
}

export function hasChildCategories(id: string): boolean {
  return (db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM categories WHERE parentId = ?").get(id)?.n ?? 0) > 0;
}

type WriteInput = { name: string; slug: string; description: string; parentId: string | null; seoTitle: string; seoDescription: string };

export function createCategory(input: WriteInput): { ok: boolean; reason?: string; id?: string } {
  if (getCategoryBySlug(input.slug)) return { ok: false, reason: "That slug is already in use." };
  const id = newId();
  db.run("INSERT INTO categories (id, name, slug, description, parentId, seoTitle, seoDescription, createdAt) VALUES (?,?,?,?,?,?,?,?)", [
    id, input.name, input.slug, input.description, input.parentId, input.seoTitle, input.seoDescription, nowTs(),
  ]);
  return { ok: true, id };
}

export function updateCategory(id: string, input: WriteInput): { ok: boolean; reason?: string } {
  const existing = getCategoryBySlug(input.slug);
  if (existing && existing.id !== id) return { ok: false, reason: "That slug is already in use." };
  if (input.parentId && categoryDescendantIds(id).has(input.parentId)) {
    return { ok: false, reason: "A category cannot be nested under itself or its own descendant." };
  }
  db.run("UPDATE categories SET name = ?, slug = ?, description = ?, parentId = ?, seoTitle = ?, seoDescription = ? WHERE id = ?", [
    input.name, input.slug, input.description, input.parentId, input.seoTitle, input.seoDescription, id,
  ]);
  return { ok: true };
}

export function deleteCategory(id: string): { ok: boolean; reason?: string } {
  if (hasChildCategories(id)) {
    return { ok: false, reason: "Delete or move the child categories first." };
  }
  db.run("DELETE FROM categories WHERE id = ?", [id]);
  return { ok: true };
}
