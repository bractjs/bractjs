import { Form } from "@bractjs/bractjs";
import type { FormState } from "../form.ts";
import type { EntityFieldsData } from "../models/fields.server.ts";
import type { Media } from "../models/media.server.ts";
import type { Page, PageNode } from "../models/pages.server.ts";
import { ErrorNote, Field, input, primaryButton, select, textarea } from "../ui.tsx";
import { CustomFields } from "./CustomFields.tsx";
import { FeaturedImagePicker } from "./MediaPicker.tsx";
import { RichField } from "./RichField.tsx";

export function PageForm({
  page,
  parentOptions,
  media,
  customFields,
  state,
  submitLabel,
}: {
  page?: Page;
  parentOptions: PageNode[];
  media: Media[];
  customFields?: EntityFieldsData;
  state?: FormState | null;
  submitLabel: string;
}) {
  const fe = state?.fieldErrors ?? {};
  return (
    <Form
      method="post"
      key={page?.id ?? "new"}
      style={{
        display: "grid",
        gap: "1.2rem",
        gridTemplateColumns: "minmax(0, 1fr) 280px",
        alignItems: "start",
      }}
    >
      <input type="hidden" name="intent" value="save" />
      <div style={{ display: "grid", gap: ".9rem" }}>
        <div className="admin-panel" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Title">
            <input name="title" defaultValue={page?.title ?? ""} required className={input} />
          </Field>
          {fe.title ? <ErrorNote>{fe.title[0]}</ErrorNote> : null}
          <Field label="Slug" hint="Unique within its parent. Leave blank to derive from the title.">
            <input name="slug" defaultValue={page?.slug ?? ""} className={input} />
          </Field>
          {fe.slug ? <ErrorNote>{fe.slug[0]}</ErrorNote> : null}
        </div>
        <div className="admin-panel">
          <span style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: ".4rem" }}>
            Body
          </span>
          <RichField name="body" defaultValue={page?.body ?? ""} />
        </div>
      </div>

      <div style={{ display: "grid", gap: ".9rem" }}>
        <div className="admin-panel" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Status">
            <select name="status" defaultValue={page?.status ?? "draft"} className={select}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
          <Field label="Parent">
            <select name="parentId" defaultValue={page?.parentId ?? ""} className={select}>
              <option value="">— none (top level) —</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {"  ".repeat(p.depth)}
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Menu order" hint="Lower numbers sort first.">
            <input
              name="menuOrder"
              type="number"
              defaultValue={String(page?.menuOrder ?? 0)}
              className={input}
            />
          </Field>
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <button type="submit" className={primaryButton}>
            {submitLabel}
          </button>
        </div>
        <div className="admin-panel">
          <span style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: ".4rem" }}>
            Featured image
          </span>
          <FeaturedImagePicker media={media} selectedId={page?.featuredMediaId ?? null} />
        </div>
        <div className="admin-panel" style={{ display: "grid", gap: ".7rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".9rem" }}>SEO</span>
          <Field label="SEO title" hint="Blank = the page title.">
            <input name="seoTitle" defaultValue={page?.seoTitle ?? ""} className={input} />
          </Field>
          {fe.seoTitle ? <ErrorNote>{fe.seoTitle[0]}</ErrorNote> : null}
          <Field label="Meta description" hint="~155 chars.">
            <textarea
              name="seoDescription"
              defaultValue={page?.seoDescription ?? ""}
              className={`${textarea} min-h-20`}
            />
          </Field>
          {fe.seoDescription ? <ErrorNote>{fe.seoDescription[0]}</ErrorNote> : null}
        </div>
      </div>

      {customFields ? (
        <div style={{ gridColumn: "1 / -1", display: "grid", gap: ".9rem" }}>
          <CustomFields data={customFields} />
        </div>
      ) : null}
    </Form>
  );
}
