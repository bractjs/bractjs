import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { deleteMedia, getMedia, mediaReferences, updateMedia, type Media, type MediaRefs } from "../../../models/media.server.ts";
import { removeUploadFile } from "../../../upload.server.ts";
import { MediaSchema, type MediaInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { dangerButton, ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";

type Data = { media: Media; refs: MediaRefs };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "media.manage");
  const media = getMedia(params.id);
  if (!media) throw new HttpError(404, "Media not found.");
  return { media, refs: mediaReferences(media.id) };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "media.manage");
  const media = getMedia(params.id);
  if (!media) throw new HttpError(404, "Media not found.");
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const force = formData.get("force") === "1";
    if (!force && mediaReferences(params.id).total > 0) {
      return flashFail({ error: "This file is still in use. Tick “delete anyway” to remove it." });
    }
    const res = deleteMedia(params.id);
    if (res.ok && res.filename) await removeUploadFile(res.filename);
    return flashRedirect("/admin/media", "Media deleted");
  }

  let data: MediaInput;
  try {
    data = await validate<MediaInput>(MediaSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  updateMedia(params.id, data);
  return flashRedirect("/admin/media", "Media saved");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Media not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <Link to="/admin/media" style={{ color: "var(--accent)", fontWeight: 600 }}>← Back to media</Link>
    </div>
  );
}

export function meta() {
  return [{ title: "Edit media | CMS Admin" }];
}

export default function MediaDetail() {
  const { media, refs } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Media</h1>
        <Link to="/admin/media" style={{ color: "var(--accent)", textDecoration: "none" }}>← All media</Link>
      </div>
      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "minmax(0, 320px) 1fr", alignItems: "start" }}>
        <div className="admin-panel">
          <img src={media.url} alt={media.alt} style={{ width: "100%", borderRadius: "8px" }} />
          <dl style={{ fontSize: ".82rem", color: "var(--muted)", display: "grid", gridTemplateColumns: "auto 1fr", gap: ".2rem .6rem", marginBottom: 0 }}>
            <dt>Name</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{media.originalName}</dd>
            <dt>Type</dt><dd style={{ margin: 0 }}>{media.mimeType}</dd>
            <dt>Size</dt><dd style={{ margin: 0 }}>{(media.size / 1024).toFixed(1)} KB</dd>
            <dt>URL</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}><code>{media.url}</code></dd>
          </dl>
        </div>

        <div style={{ display: "grid", gap: "1.2rem" }}>
          <div className="admin-panel">
            <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
              <input type="hidden" name="intent" value="save" />
              <Field label="Alt text" hint="Describes the image for screen readers & SEO.">
                <input name="alt" defaultValue={media.alt} className={input} />
              </Field>
              <Field label="Title">
                <input name="title" defaultValue={media.title} className={input} />
              </Field>
              <Field label="Caption">
                <input name="caption" defaultValue={media.caption} className={input} />
              </Field>
              <Field label="Description">
                <textarea name="description" defaultValue={media.description} className={`${input} min-h-20`} />
              </Field>
              {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
              <div><button type="submit" className={primaryButton}>Save</button></div>
            </Form>
          </div>

          <div className="admin-panel">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Usage</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              {refs.total === 0
                ? "Not referenced anywhere — safe to delete."
                : `Referenced by ${refs.posts} post field(s) and ${refs.pages} page(s).`}
            </p>
            <Form method="post" style={{ display: "flex", gap: ".8rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="intent" value="delete" />
              {refs.total > 0 ? (
                <label style={{ display: "inline-flex", gap: ".35rem", alignItems: "center", fontSize: ".85rem" }}>
                  <input type="checkbox" name="force" value="1" /> delete anyway
                </label>
              ) : null}
              <button type="submit" className={dangerButton}>Delete media</button>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}
