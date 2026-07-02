import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { deleteMedia, listMedia, mediaReferences, type Media } from "../../../models/media.server.ts";
import { removeUploadFile, saveUpload } from "../../../upload.server.ts";
import { EmptyState, ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";
import type { FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";

export async function loader({ request }: LoaderArgs): Promise<{ items: Media[] }> {
  await requirePermission(request, "media.manage");
  return { items: listMedia() };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "media.manage");
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    const force = formData.get("force") === "1";
    if (!force && mediaReferences(id).total > 0) {
      return flashFail({ error: "This file is still in use. Re-submit to delete anyway." });
    }
    const res = deleteMedia(id);
    if (res.ok && res.filename) await removeUploadFile(res.filename);
    return flashRedirect("/admin/media", "Media deleted");
  }

  // upload
  const res = await saveUpload(formData.get("file"), String(formData.get("alt") ?? ""));
  if (!res.ok) return flashFail({ error: res.reason });
  return flashRedirect("/admin/media", "Media uploaded");
}

export function meta() {
  return [{ title: "Media | CMS Admin" }];
}

export default function MediaLibrary() {
  const { items } = useLoaderData<{ items: Media[] }>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Media</h1>
        <span style={{ color: "var(--admin-muted)", fontSize: ".85rem" }}>{items.length} file{items.length === 1 ? "" : "s"}</span>
      </div>

      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "1fr 280px", alignItems: "start" }}>
        <div>
          {items.length === 0 ? (
            <EmptyState>No media yet. Upload on the right, or drag &amp; drop images anywhere.</EmptyState>
          ) : (
            <div className="media-grid">
              {items.map((m) => (
                <Link key={m.id} to={`/admin/media/${m.id}`} className="admin-panel" style={{ padding: ".5rem", textDecoration: "none", display: "grid", gap: ".4rem" }}>
                  <div style={{ aspectRatio: "1 / 1", overflow: "hidden", borderRadius: "8px", background: "#f1f4f6", display: "grid", placeItems: "center" }}>
                    <img src={m.url} alt={m.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <span style={{ fontSize: ".78rem", color: "var(--admin-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.originalName}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="admin-panel" style={{ position: "sticky", top: "5rem", display: "grid", gap: ".7rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Upload</h2>
          <p style={{ margin: 0, color: "var(--admin-muted)", fontSize: ".82rem" }}>
            Drag &amp; drop image(s) <strong>anywhere</strong> to upload, or pick a file below.
          </p>
          <Form method="post" encType="multipart/form-data" style={{ display: "grid", gap: ".7rem" }}>
            <input type="hidden" name="intent" value="upload" />
            <Field label="File" hint="PNG, JPEG, WEBP, GIF or SVG · max 8 MB">
              <input type="file" name="file" accept="image/*" required className={input} />
            </Field>
            <Field label="Alt text">
              <input name="alt" placeholder="Describe the image" className={input} />
            </Field>
            {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
            <div><button type="submit" className={primaryButton}>Upload</button></div>
          </Form>
        </aside>
      </div>
    </>
  );
}
