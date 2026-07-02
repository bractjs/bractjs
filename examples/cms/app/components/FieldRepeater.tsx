"use client";
// Repeatable custom-field rows. Like RichEditor this is a "use client" module
// (SSR-stubbed to null), so it renders null until `mounted` to avoid a hydration
// mismatch. Every row control shares name=`cf:<fieldId>`, so the action reads the
// whole set via formData.getAll(). Single (non-repeatable) fields are plain
// server-rendered controls in CustomFields — only the repeater needs JS.

import { useEffect, useState } from "react";
import { input as inputCls, select as selectCls, ghostButton } from "../ui.tsx";

type Opt = { id: string; label: string };

export function FieldRepeater({ fieldKey, kind, options, defaultValues }: {
  fieldKey: string; kind: string; options: Opt[]; defaultValues: string[];
}) {
  const [rows, setRows] = useState<string[]>(defaultValues.length ? defaultValues : [""]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const set = (i: number, v: string) => setRows(rows.map((r, j) => (j === i ? v : r)));
  return (
    <div style={{ display: "grid", gap: ".4rem" }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: ".4rem" }}>
          {kind === "text" ? (
            <input name={fieldKey} value={row} onChange={(e) => set(i, e.target.value)} className={inputCls} />
          ) : (
            <select name={fieldKey} value={row} onChange={(e) => set(i, e.target.value)} className={selectCls}>
              <option value="">— none —</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [""])} className={ghostButton} aria-label="Remove row">✕</button>
        </div>
      ))}
      <div><button type="button" onClick={() => setRows([...rows, ""])} className={ghostButton}>+ Add row</button></div>
    </div>
  );
}
