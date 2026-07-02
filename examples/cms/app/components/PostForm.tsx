import { Form } from "@bractjs/bractjs";
import type { CategoryNode } from "../models/categories.server.ts";
import type { Media } from "../models/media.server.ts";
import type { Post } from "../models/posts.server.ts";
import { ErrorNote, Field, input, primaryButton, select, textarea } from "../ui.tsx";
import type { FormState } from "../form.ts";
import { RichField } from "./RichField.tsx";
import { FeaturedImagePicker, GalleryPicker } from "./MediaPicker.tsx";
import { CustomFields } from "./CustomFields.tsx";
import type { EntityFieldsData } from "../models/fields.server.ts";

export function PostForm({
  post,
  categories,
  media,
  galleryIds = [],
  customFields,
  state,
  submitLabel,
}: {
  post?: Post;
  categories: CategoryNode[];
  media: Media[];
  galleryIds?: string[];
  customFields?: EntityFieldsData;
  state?: FormState | null;
  submitLabel: string;
}) {
  const fe = state?.fieldErrors ?? {};
  return (
    <Form method="post" key={post?.id ?? "new"} style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "minmax(0, 1fr) 280px", alignItems: "start" }}>
      <input type="hidden" name="intent" value="save" />
      <div style={{ display: "grid", gap: ".9rem" }}>
        <div className="admin-panel" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Title">
            <input name="title" defaultValue={post?.title ?? ""} required className={input} />
          </Field>
          {fe.title ? <ErrorNote>{fe.title[0]}</ErrorNote> : null}
          <Field label="Slug" hint="Leave blank to derive from the title.">
            <input name="slug" defaultValue={post?.slug ?? ""} className={input} />
          </Field>
          {fe.slug ? <ErrorNote>{fe.slug[0]}</ErrorNote> : null}
          <Field label="Excerpt" hint="Short summary shown in lists.">
            <input name="excerpt" defaultValue={post?.excerpt ?? ""} className={input} />
          </Field>
        </div>
        <div className="admin-panel">
          <span style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: ".4rem" }}>Body</span>
          <RichField name="body" defaultValue={post?.body ?? ""} />
        </div>
      </div>

      <div style={{ display: "grid", gap: ".9rem" }}>
        <div className="admin-panel" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Status">
            <select name="status" defaultValue={post?.status ?? "draft"} className={select}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
          <Field label="Category">
            <select name="categoryId" defaultValue={post?.categoryId ?? ""} className={select}>
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.name}</option>
              ))}
            </select>
          </Field>
          {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
          <button type="submit" className={primaryButton}>{submitLabel}</button>
        </div>
        <div className="admin-panel">
          <span style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: ".4rem" }}>Featured image</span>
          <FeaturedImagePicker media={media} selectedId={post?.featuredMediaId ?? null} />
        </div>
        <div className="admin-panel">
          <span style={{ fontWeight: 600, fontSize: ".9rem", display: "block", marginBottom: ".4rem" }}>Gallery</span>
          <GalleryPicker media={media} selectedIds={galleryIds} />
        </div>
        <div className="admin-panel" style={{ display: "grid", gap: ".7rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".9rem" }}>SEO</span>
          <Field label="SEO title" hint="Blank = the post title."><input name="seoTitle" defaultValue={post?.seoTitle ?? ""} className={input} /></Field>
          {fe.seoTitle ? <ErrorNote>{fe.seoTitle[0]}</ErrorNote> : null}
          <Field label="Meta description" hint="~155 chars. Blank = the excerpt."><textarea name="seoDescription" defaultValue={post?.seoDescription ?? ""} className={`${textarea} min-h-20`} /></Field>
          {fe.seoDescription ? <ErrorNote>{fe.seoDescription[0]}</ErrorNote> : null}
        </div>
      </div>

      {customFields ? <div style={{ gridColumn: "1 / -1", display: "grid", gap: ".9rem" }}><CustomFields data={customFields} /></div> : null}
    </Form>
  );
}
