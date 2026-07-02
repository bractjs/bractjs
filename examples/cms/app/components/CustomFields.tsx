// Renders an entity's custom-field groups as inputs inside the surrounding
// <Form>. Each control is named `cf:<fieldId>`; saveEntityFields() reads them
// back. Single fields are plain server-rendered controls (work without JS);
// repeatable fields defer to the "use client" FieldRepeater.

import type { EntityFieldsData } from "../models/fields.server.ts";
import { input, select } from "../ui.tsx";
import { FieldRepeater } from "./FieldRepeater.tsx";

export function CustomFields({ data }: { data: EntityFieldsData }) {
  if (data.groups.length === 0) return null;
  return (
    <>
      {data.groups.map((g) => (
        <div className="admin-panel" key={g.id} style={{ display: "grid", gap: ".8rem" }}>
          <strong style={{ fontSize: ".95rem" }}>{g.name}</strong>
          {g.fields.length === 0 ? <span style={{ color: "var(--admin-muted)", fontSize: ".85rem" }}>No fields in this group yet.</span> : null}
          {g.fields.map((f) => {
            const key = `cf:${f.id}`;
            const raw = data.values[f.id];
            const opts = f.type === "text" ? [] : data.options[f.type];
            return (
              <div key={f.id} style={{ display: "grid", gap: ".35rem" }}>
                <span style={{ fontWeight: 600, fontSize: ".9rem" }}>
                  {f.label}{f.repeatable ? <span style={{ color: "var(--admin-muted)", fontWeight: 400 }}> · repeatable</span> : null}
                </span>
                {f.repeatable ? (
                  <FieldRepeater fieldKey={key} kind={f.type} options={opts} defaultValues={Array.isArray(raw) ? raw : raw ? [raw] : []} />
                ) : f.type === "text" ? (
                  <input name={key} defaultValue={typeof raw === "string" ? raw : ""} className={input} />
                ) : (
                  <select name={key} defaultValue={typeof raw === "string" ? raw : ""} className={select}>
                    <option value="">— none —</option>
                    {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
