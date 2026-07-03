import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { PageForm } from "../../../components/PageForm.tsx";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import { type EntityFieldsData, loadEntityFields, saveEntityFields } from "../../../models/fields.server.ts";
import { listMedia, type Media } from "../../../models/media.server.ts";
import { createPage, type PageNode, pageTreeFlat } from "../../../models/pages.server.ts";
import { sanitizeHtml } from "../../../sanitize.ts";
import { type PageInput, PageSchema } from "../../../validation.ts";

type Data = { parents: PageNode[]; media: Media[]; customFields: EntityFieldsData };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "pages.manage");
  return { parents: pageTreeFlat(), media: listMedia(), customFields: loadEntityFields("page", null) };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "pages.manage");
  let data: PageInput;
  try {
    data = await validate<PageInput>(PageSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = createPage({ ...data, body: sanitizeHtml(data.body) });
  if (!res.ok || !res.id)
    return flashFail({ error: res.reason, fieldErrors: res.reason ? { slug: [res.reason] } : undefined });
  saveEntityFields("page", res.id, formData);
  return flashRedirect(`/admin/pages/${res.id}`, "Page created");
}

export function meta() {
  return [{ title: "New page | CMS Admin" }];
}

export default function NewPage() {
  const { parents, media, customFields } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>New page</h1>
        <Link to="/admin/pages" style={{ color: "var(--accent)", textDecoration: "none" }}>
          ← All pages
        </Link>
      </div>
      <PageForm
        parentOptions={parents}
        media={media}
        customFields={customFields}
        state={state}
        submitLabel="Create page"
      />
    </>
  );
}
