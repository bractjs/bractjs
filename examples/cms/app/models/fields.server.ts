// app/models/fields.server.ts — ACF-style custom fields.
//
// A field_group targets one entity type ('post'|'page'|'category') and holds an
// ordered list of fields. Each field has a type and may be `repeatable` (holds
// an array of values). Values live in field_values keyed by (entityType,
// entityId, fieldId), JSON-encoded. This module queries the posts/pages/
// categories/media TABLES directly for option/resolution lookups so it never
// imports another model (keeps the no-cycle rule from db.server.ts).

import { db, newId, nowTs, tx } from "../db.server.ts";

export type EntityType = "post" | "page" | "category";
export type FieldType = "text" | "image" | "post" | "page" | "category";
export const FIELD_TYPES: FieldType[] = ["text", "image", "post", "page", "category"];
export const ENTITY_TYPES: EntityType[] = ["post", "page", "category"];

export type FieldGroup = { id: string; name: string; target: EntityType; position: number; createdAt: number };
export type Field = { id: string; groupId: string; label: string; name: string; type: FieldType; repeatable: boolean; position: number };
type FieldRow = Omit<Field, "repeatable"> & { repeatable: number };
const toField = (r: FieldRow): Field => ({ ...r, repeatable: !!r.repeatable });

// ── Groups ───────────────────────────────────────────────────────────────────
export function listGroups(): FieldGroup[] {
  return db.query<FieldGroup, []>("SELECT * FROM field_groups ORDER BY position ASC, createdAt ASC").all();
}
export function getGroup(id: string): FieldGroup | null {
  return db.query<FieldGroup, [string]>("SELECT * FROM field_groups WHERE id = ?").get(id) ?? null;
}
export function groupsForTarget(target: EntityType): FieldGroup[] {
  return db.query<FieldGroup, [string]>("SELECT * FROM field_groups WHERE target = ? ORDER BY position ASC, createdAt ASC").all(target);
}
export function createGroup(input: { name: string; target: EntityType }): { ok: boolean; id?: string } {
  const id = newId();
  const max = db.query<{ m: number | null }, []>("SELECT MAX(position) AS m FROM field_groups").get()?.m;
  db.run("INSERT INTO field_groups (id, name, target, position, createdAt) VALUES (?,?,?,?,?)", [id, input.name, input.target, (max ?? -1) + 1, nowTs()]);
  return { ok: true, id };
}
export function updateGroup(id: string, input: { name: string; target: EntityType }): boolean {
  return db.run("UPDATE field_groups SET name = ?, target = ? WHERE id = ?", [input.name, input.target, id]).changes > 0;
}
export function deleteGroup(id: string): boolean {
  return db.run("DELETE FROM field_groups WHERE id = ?", [id]).changes > 0;
}

// ── Fields ───────────────────────────────────────────────────────────────────
export function listFields(groupId: string): Field[] {
  return db.query<FieldRow, [string]>("SELECT * FROM fields WHERE groupId = ? ORDER BY position ASC").all(groupId).map(toField);
}
export function addField(groupId: string, input: { label: string; name: string; type: FieldType; repeatable: boolean }): { ok: boolean; reason?: string } {
  if (db.query("SELECT 1 FROM fields WHERE groupId = ? AND name = ?").get(groupId, input.name)) {
    return { ok: false, reason: `A field named "${input.name}" already exists in this group.` };
  }
  const max = db.query<{ m: number | null }, [string]>("SELECT MAX(position) AS m FROM fields WHERE groupId = ?").get(groupId)?.m;
  db.run("INSERT INTO fields (id, groupId, label, name, type, repeatable, position) VALUES (?,?,?,?,?,?,?)", [
    newId(), groupId, input.label, input.name, input.type, input.repeatable ? 1 : 0, (max ?? -1) + 1,
  ]);
  return { ok: true };
}
export function removeField(fieldId: string): boolean {
  return db.run("DELETE FROM fields WHERE id = ?", [fieldId]).changes > 0;
}
export function moveField(fieldId: string, dir: "up" | "down"): boolean {
  const f = db.query<FieldRow, [string]>("SELECT * FROM fields WHERE id = ?").get(fieldId);
  if (!f) return false;
  const op = dir === "up" ? "<" : ">";
  const order = dir === "up" ? "DESC" : "ASC";
  const n = db.query<FieldRow, [string, number]>(`SELECT * FROM fields WHERE groupId = ? AND position ${op} ? ORDER BY position ${order} LIMIT 1`).get(f.groupId, f.position);
  if (!n) return false;
  tx(() => {
    db.run("UPDATE fields SET position = ? WHERE id = ?", [n.position, f.id]);
    db.run("UPDATE fields SET position = ? WHERE id = ?", [f.position, n.id]);
  });
  return true;
}

// ── Values ───────────────────────────────────────────────────────────────────
function isEmpty(v: string | string[]): boolean {
  return Array.isArray(v) ? v.length === 0 : v.trim() === "";
}
export function setFieldValue(entityType: EntityType, entityId: string, fieldId: string, value: string | string[]): void {
  if (isEmpty(value)) {
    db.run("DELETE FROM field_values WHERE entityType = ? AND entityId = ? AND fieldId = ?", [entityType, entityId, fieldId]);
    return;
  }
  db.run(
    `INSERT INTO field_values (entityType, entityId, fieldId, value) VALUES (?,?,?,?)
     ON CONFLICT(entityType, entityId, fieldId) DO UPDATE SET value = excluded.value`,
    [entityType, entityId, fieldId, JSON.stringify(value)],
  );
}
/** Raw stored values for an entity, keyed by fieldId. */
export function getFieldValues(entityType: EntityType, entityId: string): Record<string, string | string[]> {
  const rows = db.query<{ fieldId: string; value: string }, [string, string]>("SELECT fieldId, value FROM field_values WHERE entityType = ? AND entityId = ?").all(entityType, entityId);
  const out: Record<string, string | string[]> = {};
  for (const r of rows) {
    try { out[r.fieldId] = JSON.parse(r.value) as string | string[]; } catch { /* skip corrupt */ }
  }
  return out;
}
export function deleteEntityFields(entityType: EntityType, entityId: string): void {
  db.run("DELETE FROM field_values WHERE entityType = ? AND entityId = ?", [entityType, entityId]);
}

// ── Options (for the <select>s in the editor) ────────────────────────────────
export type Option = { id: string; label: string };
export type FieldOptions = { image: Option[]; post: Option[]; page: Option[]; category: Option[] };
export function fieldOptions(): FieldOptions {
  return {
    image: db.query<Option, []>("SELECT id, originalName AS label FROM media ORDER BY createdAt DESC").all(),
    post: db.query<Option, []>("SELECT id, title AS label FROM posts ORDER BY title ASC").all(),
    page: db.query<Option, []>("SELECT id, title AS label FROM pages ORDER BY title ASC").all(),
    category: db.query<Option, []>("SELECT id, name AS label FROM categories ORDER BY name ASC").all(),
  };
}

// ── Edit-form bundle + save ──────────────────────────────────────────────────
export type GroupWithFields = FieldGroup & { fields: Field[] };
export type EntityFieldsData = {
  groups: GroupWithFields[];
  values: Record<string, string | string[]>;
  options: FieldOptions;
};
/** Everything the entity edit form needs to render custom fields. */
export function loadEntityFields(target: EntityType, entityId: string | null): EntityFieldsData {
  const groups = groupsForTarget(target).map((g) => ({ ...g, fields: listFields(g.id) }));
  return { groups, values: entityId ? getFieldValues(target, entityId) : {}, options: fieldOptions() };
}
/** Read `cf:<fieldId>` inputs out of a submitted form and persist them. */
export function saveEntityFields(target: EntityType, entityId: string, formData: FormData): void {
  for (const g of groupsForTarget(target)) {
    for (const f of listFields(g.id)) {
      const key = `cf:${f.id}`;
      const value = f.repeatable
        ? formData.getAll(key).map(String).filter((s) => s.trim() !== "")
        : String(formData.get(key) ?? "");
      setFieldValue(target, entityId, f.id, value);
    }
  }
}

// ── Public resolution (get_field) ────────────────────────────────────────────
export type ResolvedValue =
  | { type: "text"; text: string }
  | { type: "image"; url: string; alt: string }
  | { type: "post" | "page" | "category"; title: string; url: string | null };
export type ResolvedField = { field: Field; values: ResolvedValue[] };

function pagePath(pageId: string): string | null {
  const q = db.query<{ slug: string; parentId: string | null }, [string]>("SELECT slug, parentId FROM pages WHERE id = ?");
  const slugs: string[] = [];
  let cur = q.get(pageId) ?? null;
  let guard = 0;
  while (cur && guard++ < 50) { slugs.unshift(cur.slug); cur = cur.parentId ? q.get(cur.parentId) ?? null : null; }
  return slugs.length ? `/${slugs.join("/")}` : null;
}
function resolveOne(type: FieldType, raw: string): ResolvedValue | null {
  if (type === "text") return raw ? { type: "text", text: raw } : null;
  if (type === "image") {
    const m = db.query<{ url: string; alt: string }, [string]>("SELECT url, alt FROM media WHERE id = ?").get(raw);
    return m ? { type: "image", url: m.url, alt: m.alt } : null;
  }
  if (type === "post") {
    const p = db.query<{ title: string; slug: string }, [string]>("SELECT title, slug FROM posts WHERE id = ?").get(raw);
    return p ? { type: "post", title: p.title, url: `/posts/${p.slug}` } : null;
  }
  if (type === "page") {
    const p = db.query<{ title: string }, [string]>("SELECT title FROM pages WHERE id = ?").get(raw);
    return p ? { type: "page", title: p.title, url: pagePath(raw) } : null;
  }
  const c = db.query<{ name: string; slug: string }, [string]>("SELECT name, slug FROM categories WHERE id = ?").get(raw);
  return c ? { type: "category", title: c.name, url: `/category/${c.slug}` } : null;
}
/** Resolved, render-ready custom fields for an entity (skips empty/dangling refs). */
export function resolveEntityFields(target: EntityType, entityId: string): ResolvedField[] {
  const values = getFieldValues(target, entityId);
  const out: ResolvedField[] = [];
  for (const g of groupsForTarget(target)) {
    for (const f of listFields(g.id)) {
      const raw = values[f.id];
      if (raw === undefined) continue;
      const arr = Array.isArray(raw) ? raw : [raw];
      const resolved = arr.map((r) => resolveOne(f.type, r)).filter((x): x is ResolvedValue => x !== null);
      if (resolved.length) out.push({ field: f, values: resolved });
    }
  }
  return out;
}
