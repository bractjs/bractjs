// In-memory DB (NODE_ENV=test). The boot seed provides categories/posts we can
// point link fields at when testing resolution.
import { test, expect } from "bun:test";
import { db } from "../db.server.ts";
import {
  createGroup, getGroup, groupsForTarget, updateGroup, deleteGroup,
  addField, listFields, moveField, removeField,
  setFieldValue, getFieldValues, saveEntityFields, resolveEntityFields,
} from "../models/fields.server.ts";

const rnd = () => crypto.randomUUID().slice(0, 8);
function group(target: "post" | "page" | "category" = "post") {
  return getGroup(createGroup({ name: `G-${rnd()}`, target }).id!)!;
}

test("createGroup + groupsForTarget + update + delete", () => {
  const g = group("page");
  expect(groupsForTarget("page").some((x) => x.id === g.id)).toBe(true);
  expect(updateGroup(g.id, { name: "Renamed", target: "post" })).toBe(true);
  expect(getGroup(g.id)!.target).toBe("post");
  expect(deleteGroup(g.id)).toBe(true);
  expect(getGroup(g.id)).toBeNull();
});

test("addField enforces a unique name per group", () => {
  const g = group();
  expect(addField(g.id, { label: "Subtitle", name: "subtitle", type: "text", repeatable: false }).ok).toBe(true);
  const dup = addField(g.id, { label: "Other", name: "subtitle", type: "text", repeatable: false });
  expect(dup.ok).toBe(false);
  expect(listFields(g.id)).toHaveLength(1);
});

test("moveField swaps order; removeField deletes", () => {
  const g = group();
  addField(g.id, { label: "A", name: "a", type: "text", repeatable: false });
  addField(g.id, { label: "B", name: "b", type: "text", repeatable: false });
  let ids = listFields(g.id).map((f) => f.name);
  expect(ids).toEqual(["a", "b"]);
  moveField(listFields(g.id)[1]!.id, "up");
  expect(listFields(g.id).map((f) => f.name)).toEqual(["b", "a"]);
  removeField(listFields(g.id)[0]!.id);
  expect(listFields(g.id).map((f) => f.name)).toEqual(["a"]);
});

test("setFieldValue stores JSON; empty deletes; repeatable round-trips an array", () => {
  const g = group();
  addField(g.id, { label: "Title", name: "title", type: "text", repeatable: false });
  addField(g.id, { label: "Tags", name: "tags", type: "text", repeatable: true });
  const [single, repeat] = listFields(g.id);
  const eid = `e-${rnd()}`;
  setFieldValue("post", eid, single!.id, "hello");
  setFieldValue("post", eid, repeat!.id, ["x", "y"]);
  expect(getFieldValues("post", eid)).toEqual({ [single!.id]: "hello", [repeat!.id]: ["x", "y"] });
  // Empty clears the row.
  setFieldValue("post", eid, single!.id, "");
  expect(getFieldValues("post", eid)[single!.id]).toBeUndefined();
});

test("saveEntityFields reads cf:<id> inputs (single via get, repeatable via getAll, empties dropped)", () => {
  const g = group();
  addField(g.id, { label: "Heading", name: "heading", type: "text", repeatable: false });
  addField(g.id, { label: "Items", name: "items", type: "text", repeatable: true });
  const [single, repeat] = listFields(g.id);
  const fd = new FormData();
  fd.set(`cf:${single!.id}`, "Welcome");
  fd.append(`cf:${repeat!.id}`, "one");
  fd.append(`cf:${repeat!.id}`, "");      // filtered out
  fd.append(`cf:${repeat!.id}`, "two");
  const eid = `e-${rnd()}`;
  saveEntityFields("post", eid, fd);
  expect(getFieldValues("post", eid)).toEqual({ [single!.id]: "Welcome", [repeat!.id]: ["one", "two"] });
});

test("resolveEntityFields resolves text + a post link, skipping dangling refs", () => {
  const post = db.query<{ id: string; slug: string }, []>("SELECT id, slug FROM posts LIMIT 1").get()!;
  const g = group();
  addField(g.id, { label: "Note", name: "note", type: "text", repeatable: false });
  addField(g.id, { label: "Related", name: "related", type: "post", repeatable: true });
  const [note, related] = listFields(g.id);
  const eid = `e-${rnd()}`;
  setFieldValue("post", eid, note!.id, "see also");
  setFieldValue("post", eid, related!.id, [post.id, "missing-id"]);
  const resolved = resolveEntityFields("post", eid);
  const noteR = resolved.find((r) => r.field.id === note!.id)!;
  expect(noteR.values).toEqual([{ type: "text", text: "see also" }]);
  const relR = resolved.find((r) => r.field.id === related!.id)!;
  expect(relR.values).toEqual([{ type: "post", title: expect.any(String), url: `/posts/${post.slug}` }]);
});
