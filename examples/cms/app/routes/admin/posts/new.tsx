import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { PostForm } from "../../../components/PostForm.tsx";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import { type CategoryNode, categoryTreeFlat } from "../../../models/categories.server.ts";
import { type EntityFieldsData, loadEntityFields, saveEntityFields } from "../../../models/fields.server.ts";
import { listMedia, type Media } from "../../../models/media.server.ts";
import { createPost, setPostMedia } from "../../../models/posts.server.ts";
import { sanitizeHtml } from "../../../sanitize.ts";
import { type PostInput, PostSchema } from "../../../validation.ts";

type Data = { categories: CategoryNode[]; media: Media[]; customFields: EntityFieldsData };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "posts.manage");
  return { categories: categoryTreeFlat(), media: listMedia(), customFields: loadEntityFields("post", null) };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  const user = await requirePermission(request, "posts.manage");
  let data: PostInput;
  try {
    data = await validate<PostInput>(PostSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = createPost({ ...data, body: sanitizeHtml(data.body) }, user.id);
  if (!res.ok || !res.id)
    return flashFail({ error: res.reason, fieldErrors: res.reason ? { slug: [res.reason] } : undefined });
  setPostMedia(res.id, formData.getAll("mediaIds").map(String));
  saveEntityFields("post", res.id, formData);
  return flashRedirect(`/admin/posts/${res.id}`, "Post created");
}

export function meta() {
  return [{ title: "New post | CMS Admin" }];
}

export default function NewPost() {
  const { categories, media, customFields } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>New post</h1>
        <Link to="/admin/posts" style={{ color: "var(--accent)", textDecoration: "none" }}>
          ← All posts
        </Link>
      </div>
      <PostForm
        categories={categories}
        media={media}
        customFields={customFields}
        state={state}
        submitLabel="Create post"
      />
    </>
  );
}
