import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, validate } from "@bractjs/bractjs";
import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { deletePage, getPage, pageDescendantIds, pageFullPath, pageTreeFlat, updatePage, type Page, type PageNode } from "../../../models/pages.server.ts";
import { listMedia, type Media } from "../../../models/media.server.ts";
import { loadEntityFields, saveEntityFields, type EntityFieldsData } from "../../../models/fields.server.ts";
import { sanitizeHtml } from "../../../sanitize.ts";
import { PageSchema, type PageInput } from "../../../validation.ts";
import { fromValidationError, type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { PageForm } from "../../../components/PageForm.tsx";
import { Badge, dangerButton, ghostButton } from "../../../ui.tsx";

// `blocked` is an ARRAY, not a Set: loader data is JSON-serialized into the
// client bootstrap, and a Set serializes to `{}` (so `.has` is undefined and the
// component crashes on hydration). Arrays round-trip; use `.includes()`.
type Data = { page: Page; parents: PageNode[]; blocked: string[]; media: Media[]; fullPath: string; customFields: EntityFieldsData };

export async function loader({ request, params }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "pages.manage");
  const page = getPage(params.id);
  if (!page) throw new HttpError(404, "Page not found.");
  return {
    page,
    parents: pageTreeFlat(),
    blocked: [...pageDescendantIds(page.id)],
    media: listMedia(),
    fullPath: pageFullPath(page.id),
    customFields: loadEntityFields("page", page.id),
  };
}

export async function action({ request, params, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "pages.manage");
  const page = getPage(params.id);
  if (!page) throw new HttpError(404, "Page not found.");
  if (String(formData.get("intent")) === "delete") {
    const res = deletePage(params.id);
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/pages", "Page deleted");
  }
  let data: PageInput;
  try {
    data = await validate<PageInput>(PageSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = updatePage(params.id, { ...data, body: sanitizeHtml(data.body) });
  if (!res.ok) return flashFail({ error: res.reason });
  saveEntityFields("page", params.id, formData);
  return flashRedirect(`/admin/pages/${params.id}`, "Page saved");
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Page not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <Link to="/admin/pages" style={{ color: "var(--accent)", fontWeight: 600 }}>← Back to pages</Link>
    </div>
  );
}

export function meta() {
  return [{ title: "Edit page | CMS Admin" }];
}

export default function EditPage() {
  const { page, parents, blocked, media, fullPath, customFields } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <div style={{ display: "flex", gap: ".7rem", alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>Edit page</h1>
          <Badge tone={page.status === "published" ? "published" : "draft"}>{page.status}</Badge>
        </div>
        <div className="toolbar">
          {page.status === "published" ? <Link to={fullPath} className={ghostButton}>View ↗</Link> : null}
          <Link to="/admin/pages" style={{ color: "var(--accent)", textDecoration: "none", alignSelf: "center" }}>← All pages</Link>
        </div>
      </div>
      <PageForm
        page={page}
        parentOptions={parents.filter((p) => !blocked.includes(p.id))}
        media={media}
        customFields={customFields}
        state={state}
        submitLabel="Save changes"
      />
      <Form method="post" style={{ marginTop: "1rem" }}>
        <input type="hidden" name="intent" value="delete" />
        <button type="submit" className={dangerButton}>Delete page</button>
      </Form>
    </>
  );
}
