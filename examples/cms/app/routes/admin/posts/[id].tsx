import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { HttpError, defineActions, safeValidate } from "@bractjs/bractjs";
import type { LoaderArgs } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { categoryTreeFlat } from "../../../models/categories.server.ts";
import { listMedia } from "../../../models/media.server.ts";
import {
  deletePost, getPost, getPostGalleryIds, setPostMedia, setPostStatus, updatePost,
} from "../../../models/posts.server.ts";
import { loadEntityFields, saveEntityFields } from "../../../models/fields.server.ts";
import { sanitizeHtml } from "../../../sanitize.ts";
import { PostSchema, type PostInput } from "../../../validation.ts";
import { type FormState } from "../../../form.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { PostForm } from "../../../components/PostForm.tsx";
import { Badge, dangerButton, ghostButton } from "../../../ui.tsx";

export async function loader({ request, params }: LoaderArgs) {
  await requirePermission(request, "posts.manage");
  const post = getPost(params.id);
  if (!post) throw new HttpError(404, "Post not found.");
  return { post, categories: categoryTreeFlat(), media: listMedia(), galleryIds: getPostGalleryIds(post.id), customFields: loadEntityFields("post", post.id) };
}

// Each toolbar control / PostForm sets a matching `intent` (PostForm → "save").
export const action = defineActions({
  delete: async ({ request, params }) => {
    await requirePermission(request, "posts.manage");
    deletePost(params.id);
    return flashRedirect("/admin/posts", "Post deleted");
  },
  publish: async ({ request, params }) => {
    await requirePermission(request, "posts.manage");
    setPostStatus(params.id, "published");
    return flashRedirect(`/admin/posts/${params.id}`, "Post published");
  },
  unpublish: async ({ request, params }) => {
    await requirePermission(request, "posts.manage");
    setPostStatus(params.id, "draft");
    return flashRedirect(`/admin/posts/${params.id}`, "Post moved to drafts", "info");
  },
  save: async ({ request, params, formData }): Promise<FormState | Response> => {
    await requirePermission(request, "posts.manage");
    if (!getPost(params.id)) throw new HttpError(404, "Post not found.");
    const result = await safeValidate<PostInput>(PostSchema, formData);
    if (!result.ok) return flashFail({ error: result.firstError, fieldErrors: result.fieldErrors });
    const res = updatePost(params.id, { ...result.data, body: sanitizeHtml(result.data.body) });
    if (!res.ok) return flashFail({ error: res.reason, fieldErrors: res.reason ? { slug: [res.reason] } : undefined });
    setPostMedia(params.id, formData.getAll("mediaIds").map(String));
    saveEntityFields("post", params.id, formData);
    return flashRedirect(`/admin/posts/${params.id}`, "Post saved");
  },
});

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="admin-panel">
      <h1 style={{ marginTop: 0 }}>Post not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <Link to="/admin/posts" style={{ color: "var(--accent)", fontWeight: 600 }}>← Back to posts</Link>
    </div>
  );
}

export function meta() {
  return [{ title: "Edit post | CMS Admin" }];
}

export default function EditPost() {
  const { post, categories, media, galleryIds, customFields } = useLoaderData<typeof loader>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <div style={{ display: "flex", gap: ".7rem", alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>Edit post</h1>
          <Badge tone={post.status === "published" ? "published" : "draft"}>{post.status}</Badge>
        </div>
        <div className="toolbar">
          {post.status === "published" ? (
            <Link to={`/posts/${post.slug}`} className={ghostButton}>View ↗</Link>
          ) : null}
          <Form method="post" intent={post.status === "published" ? "unpublish" : "publish"} style={{ margin: 0 }}>
            <button type="submit" className={ghostButton}>{post.status === "published" ? "Unpublish" : "Publish"}</button>
          </Form>
          <Link to="/admin/posts" style={{ color: "var(--accent)", textDecoration: "none", alignSelf: "center" }}>← All posts</Link>
        </div>
      </div>

      <PostForm post={post} categories={categories} media={media} galleryIds={galleryIds} customFields={customFields} state={state} submitLabel="Save changes" />

      <Form method="post" intent="delete" style={{ marginTop: "1rem" }}>
        <button type="submit" className={dangerButton}>Delete post</button>
      </Form>
    </>
  );
}
