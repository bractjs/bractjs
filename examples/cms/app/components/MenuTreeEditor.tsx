"use client";
// Nested, drag/drop menu editor. Drag a row onto the TOP of another to drop it
// as a sibling before, the BOTTOM for after, or the MIDDLE to nest it as a child
// (unlimited depth). Inline-edit each item's label + CSS class, remove items, then
// "Save layout" submits the whole tree (flattened to {id,parentId,position,label,
// cssClass}) to the route action. "use client" → SSR-stubbed, so it renders null
// until mounted (no hydration mismatch); the admin requires JS, like RichEditor.

import { useEffect, useRef, useState } from "react";
import { Form } from "@bractjs/bractjs";
import { ghostButton, input, primaryButton } from "../ui.tsx";

const ids = (ns: EditorNode[]): string[] => ns.flatMap((n) => [n.id, ...ids(n.children)]);

export type EditorNode = { id: string; label: string; badge: string; cssClass: string; children: EditorNode[] };
type Zone = "before" | "after" | "inside";

const clone = (ns: EditorNode[]): EditorNode[] => ns.map((n) => ({ ...n, children: clone(n.children) }));
function take(ns: EditorNode[], id: string): EditorNode | null {
  for (let i = 0; i < ns.length; i++) {
    if (ns[i]!.id === id) return ns.splice(i, 1)[0]!;
    const f = take(ns[i]!.children, id);
    if (f) return f;
  }
  return null;
}
const has = (n: EditorNode, id: string): boolean => n.id === id || n.children.some((c) => has(c, id));
function put(ns: EditorNode[], targetId: string, zone: Zone, node: EditorNode): boolean {
  for (let i = 0; i < ns.length; i++) {
    if (ns[i]!.id === targetId) {
      if (zone === "inside") ns[i]!.children.push(node);
      else ns.splice(zone === "before" ? i : i + 1, 0, node);
      return true;
    }
    if (put(ns[i]!.children, targetId, zone, node)) return true;
  }
  return false;
}
function patch(ns: EditorNode[], id: string, p: Partial<EditorNode>): boolean {
  for (const n of ns) {
    if (n.id === id) { Object.assign(n, p); return true; }
    if (patch(n.children, id, p)) return true;
  }
  return false;
}
function flatten(ns: EditorNode[], parentId: string | null = null, out: Array<{ id: string; parentId: string | null; position: number; label: string; cssClass: string }> = []) {
  ns.forEach((n, i) => { out.push({ id: n.id, parentId, position: i, label: n.label, cssClass: n.cssClass }); flatten(n.children, n.id, out); });
  return out;
}

export function MenuTreeEditor({ items }: { items: EditorNode[] }) {
  const [tree, setTree] = useState<EditorNode[]>(items);
  const [over, setOver] = useState<{ id: string; zone: Zone } | null>(null);
  const dragId = useRef<string | null>(null); // ref, not state → dragging never re-renders/remounts
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Re-sync only when the server item-SET changes (e.g. after Add revalidates the
  // loader), keyed on ids — so a local drag/edit (no server change) is never clobbered.
  const sig = ids(items).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTree(items); }, [sig]);
  if (!mounted) return null;

  const zoneOf = (e: React.DragEvent): Zone => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.3 ? "before" : y > 0.7 ? "after" : "inside";
  };
  const commit = (targetId: string, zone: Zone) => {
    const id = dragId.current; dragId.current = null; setOver(null);
    if (!id || id === targetId) return;
    const next = clone(tree);
    const node = take(next, id);
    if (!node || has(node, targetId)) return; // can't nest into itself/descendant
    if (put(next, targetId, zone, node)) setTree(next);
  };
  const edit = (id: string, p: Partial<EditorNode>) => setTree((t) => { const n = clone(t); patch(n, id, p); return n; });
  const remove = (id: string) => setTree((t) => { const n = clone(t); take(n, id); return n; });

  // Plain recursive function (NOT a component): returns host <li>/<ul> keyed by id,
  // so re-renders reconcile in place and never destroy the node being dragged.
  const rows = (nodes: EditorNode[], depth = 0): React.ReactNode => (
    <ul style={{ margin: depth ? "0 0 0 1.5rem" : 0, padding: 0, listStyle: "none" }}>
      {nodes.map((node) => {
        const ind = over?.id === node.id ? over.zone : null;
        return (
          <li key={node.id}>
            <div
              onDragOver={(e) => { if (!dragId.current) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; const z = zoneOf(e); setOver((p) => (p?.id === node.id && p.zone === z ? p : { id: node.id, zone: z })); }}
              onDrop={(e) => { e.preventDefault(); commit(node.id, zoneOf(e)); }}
              style={{
                display: "flex", alignItems: "center", gap: ".5rem", padding: ".45rem .6rem", marginBottom: ".4rem",
                borderRadius: "8px", background: ind === "inside" ? "var(--admin-accent-soft)" : "#fff",
                border: "1px solid var(--admin-line)",
                borderTop: `2px solid ${ind === "before" ? "var(--admin-accent)" : "transparent"}`,
                borderBottom: `2px solid ${ind === "after" ? "var(--admin-accent)" : "transparent"}`,
              }}
            >
              <span
                draggable
                onDragStart={(e) => { dragId.current = node.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", node.id); const row = e.currentTarget.parentElement; if (row) e.dataTransfer.setDragImage(row, 12, 12); }}
                onDragEnd={() => { dragId.current = null; setOver(null); }}
                style={{ cursor: "grab", color: "var(--admin-muted)", userSelect: "none", padding: "0 .2rem" }}
                aria-label="Drag to reorder"
              >⠿</span>
              <input value={node.label} onChange={(e) => edit(node.id, { label: e.target.value })} className={input} style={{ flex: 1 }} aria-label="Label" />
              <input value={node.cssClass} onChange={(e) => edit(node.id, { cssClass: e.target.value })} className={input} style={{ width: "10rem" }} placeholder="css class" aria-label="CSS class" />
              <span style={{ color: "var(--admin-muted)", fontSize: ".75rem", whiteSpace: "nowrap" }}>{node.badge}</span>
              <button type="button" onClick={() => remove(node.id)} className={ghostButton} aria-label="Remove">✕</button>
            </div>
            {node.children.length > 0 ? rows(node.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="reorder" />
      <input type="hidden" name="layout" value={JSON.stringify(flatten(tree))} />
      <p style={{ margin: "0 0 .6rem", color: "var(--admin-muted)", fontSize: ".82rem" }}>
        Drag the ⠿ handle — top/bottom edge to reorder, middle to nest. Edit labels &amp; CSS classes inline, then Save.
      </p>
      {tree.length === 0 ? <p style={{ color: "var(--admin-muted)" }}>No items yet — add one on the right.</p> : rows(tree)}
      <div style={{ marginTop: ".8rem" }}><button type="submit" className={primaryButton}>Save layout</button></div>
    </Form>
  );
}
