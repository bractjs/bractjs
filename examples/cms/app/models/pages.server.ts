import { db, newId, nowTs } from "../db.server.ts";

export type PageStatus = "draft" | "published";

export type Page = {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: PageStatus;
  parentId: string | null;
  featuredMediaId: string | null;
  menuOrder: number;
  seoTitle: string;
  seoDescription: string;
  createdAt: number;
  updatedAt: number;
};

export type PageNode = Page & { depth: number; children: PageNode[] };

function listPages(publishedOnly = false): Page[] {
  const where = publishedOnly ? "WHERE status = 'published'" : "";
  return db.query<Page, []>(`SELECT * FROM pages ${where} ORDER BY menuOrder ASC, title ASC`).all();
}

export function getPage(id: string): Page | null {
  return db.query<Page, [string]>("SELECT * FROM pages WHERE id = ?").get(id) ?? null;
}

export function pageTree(opts: { publishedOnly?: boolean } = {}): PageNode[] {
  const flat = listPages(opts.publishedOnly);
  const byId = new Map<string, PageNode>();
  for (const p of flat) byId.set(p.id, { ...p, depth: 0, children: [] });
  const roots: PageNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const assign = (nodes: PageNode[], depth: number) => {
    for (const n of nodes) { n.depth = depth; assign(n.children, depth + 1); }
  };
  assign(roots, 0);
  return roots;
}

export function pageTreeFlat(opts: { publishedOnly?: boolean } = {}): PageNode[] {
  const out: PageNode[] = [];
  const walk = (nodes: PageNode[]) => { for (const n of nodes) { out.push(n); walk(n.children); } };
  walk(pageTree(opts));
  return out;
}

/** Resolve a page by its full slug path (e.g. ["about","team"]). */
export function getPageByPath(segments: string[], opts: { publishedOnly?: boolean } = {}): Page | null {
  let parentId: string | null = null;
  let page: Page | null = null;
  for (const slug of segments) {
    const row: Page | null = db
      .query<Page, [string | null, string]>("SELECT * FROM pages WHERE IFNULL(parentId,'') = IFNULL(?,'') AND slug = ?")
      .get(parentId, slug) ?? null;
    if (!row) return null;
    if (opts.publishedOnly && row.status !== "published") return null;
    page = row;
    parentId = row.id;
  }
  return page;
}

export function pageAncestors(id: string): Page[] {
  const chain: Page[] = [];
  let current = getPage(id);
  while (current?.parentId) {
    const parent = getPage(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function pageFullPath(id: string): string {
  const page = getPage(id);
  if (!page) return "/";
  const slugs = [...pageAncestors(id).map((a) => a.slug), page.slug];
  return `/${slugs.join("/")}`;
}

export function childPages(parentId: string, publishedOnly = false): Page[] {
  const extra = publishedOnly ? "AND status = 'published'" : "";
  return db.query<Page, [string]>(`SELECT * FROM pages WHERE parentId = ? ${extra} ORDER BY menuOrder ASC, title ASC`).all(parentId);
}

export function pageDescendantIds(id: string): Set<string> {
  const ids = new Set<string>([id]);
  const q = db.query<{ id: string }, [string]>("SELECT id FROM pages WHERE parentId = ?");
  const walk = (pid: string) => {
    for (const row of q.all(pid)) if (!ids.has(row.id)) { ids.add(row.id); walk(row.id); }
  };
  walk(id);
  return ids;
}

export function hasChildPages(id: string): boolean {
  return (db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM pages WHERE parentId = ?").get(id)?.n ?? 0) > 0;
}

type WriteInput = {
  title: string; slug: string; body: string; status: PageStatus;
  parentId: string | null; featuredMediaId: string | null; menuOrder: number;
  seoTitle: string; seoDescription: string;
};

function slugTaken(parentId: string | null, slug: string, exceptId?: string): boolean {
  const row = db.query<{ id: string }, [string | null, string]>(
    "SELECT id FROM pages WHERE IFNULL(parentId,'') = IFNULL(?,'') AND slug = ?",
  ).get(parentId, slug);
  return !!row && row.id !== exceptId;
}

export function createPage(input: WriteInput): { ok: boolean; reason?: string; id?: string } {
  if (slugTaken(input.parentId, input.slug)) return { ok: false, reason: "A page with that slug already exists under this parent." };
  const id = newId();
  const now = nowTs();
  db.run(
    "INSERT INTO pages (id, title, slug, body, status, parentId, featuredMediaId, menuOrder, seoTitle, seoDescription, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, input.title, input.slug, input.body, input.status, input.parentId, input.featuredMediaId, input.menuOrder, input.seoTitle, input.seoDescription, now, now],
  );
  return { ok: true, id };
}

export function updatePage(id: string, input: WriteInput): { ok: boolean; reason?: string } {
  if (!getPage(id)) return { ok: false, reason: "Page not found." };
  if (input.parentId && pageDescendantIds(id).has(input.parentId)) {
    return { ok: false, reason: "A page cannot be nested under itself or its own descendant." };
  }
  if (slugTaken(input.parentId, input.slug, id)) {
    return { ok: false, reason: "A page with that slug already exists under this parent." };
  }
  db.run(
    "UPDATE pages SET title=?, slug=?, body=?, status=?, parentId=?, featuredMediaId=?, menuOrder=?, seoTitle=?, seoDescription=?, updatedAt=? WHERE id=?",
    [input.title, input.slug, input.body, input.status, input.parentId, input.featuredMediaId, input.menuOrder, input.seoTitle, input.seoDescription, nowTs(), id],
  );
  return { ok: true };
}

export function deletePage(id: string): { ok: boolean; reason?: string } {
  if (hasChildPages(id)) return { ok: false, reason: "Delete or move the child pages first." };
  db.run("DELETE FROM pages WHERE id = ?", [id]);
  return { ok: true };
}
