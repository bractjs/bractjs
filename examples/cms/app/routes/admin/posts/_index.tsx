import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { json, Link, useFetcher, useFetchers, useLoaderData, useSetSearch } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashCookie } from "../../../flash.server.ts";
import type { FormState } from "../../../form.ts";
import { deletePost, listPosts, type Post, type PostStatus } from "../../../models/posts.server.ts";
import { Badge, dangerButton, EmptyState, ghostButton, primaryButton } from "../../../ui.tsx";

type StatusFilter = PostStatus | "all";
type Data = { posts: Post[]; status: StatusFilter };
type PostsSearch = { status: StatusFilter };

// Validates/coerces `?status=` before the loader runs — junk values fall back
// to "all" (the hand-rolled equivalent of z.enum([...]).catch("all")).
export const searchSchema = {
  safeParse(input: unknown) {
    const raw = (input as { status?: unknown })?.status;
    const status: StatusFilter = raw === "draft" || raw === "published" ? raw : "all";
    return { success: true, data: { status } satisfies PostsSearch };
  },
};

export async function loader({ request, search }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "posts.manage");
  const { status } = search as PostsSearch; // searchSchema output — already coerced
  return { posts: listPosts(status === "all" ? {} : { status }), status };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "posts.manage");
  if (String(formData.get("intent")) === "delete") {
    // No redirect: the delete is submitted through a fetcher, which
    // auto-revalidates this route's loader (and the admin layout's) once the
    // action settles. The flash cookie set here is read on that revalidation
    // and popped as a toast by AdminShell.
    deletePost(String(formData.get("id") ?? ""));
    return json({}, { headers: { "Set-Cookie": await flashCookie("Post deleted") } });
  }
  return {};
}

export function meta() {
  return [{ title: "Posts | CMS Admin" }];
}

const FILTERS: StatusFilter[] = ["all", "published", "draft"];

/**
 * One row, owning its keyed delete fetcher. The key gives the mutation an
 * identity other components can observe (see the pending counter below), and
 * `fetcher.state` drives the optimistic dimming while the delete is in flight.
 */
function PostRow({ post }: { post: Post }) {
  const fetcher = useFetcher({ key: `delete-post-${post.id}` });
  const deleting = fetcher.state !== "idle";

  return (
    <tr style={deleting ? { opacity: 0.4, transition: "opacity .15s" } : undefined}>
      <td>
        {/* prefetch="viewport": rows visible on screen warm their edit page's
            chunk + loader data, so clicking commits instantly. */}
        <Link
          to={`/admin/posts/${post.id}`}
          prefetch="viewport"
          style={{ fontWeight: 600, textDecoration: "none" }}
        >
          {post.title}
        </Link>
        <div style={{ color: "var(--muted)", fontSize: ".78rem" }}>
          <code>/posts/{post.slug}</code>
        </div>
      </td>
      <td>
        <Badge tone={post.status === "published" ? "published" : "draft"}>{post.status}</Badge>
      </td>
      <td style={{ color: "var(--muted)", fontSize: ".85rem" }}>
        {new Date(post.updatedAt).toLocaleDateString()}
      </td>
      <td>
        <div className="toolbar">
          <Link to={`/admin/posts/${post.id}`} prefetch="viewport" className={ghostButton}>
            Edit
          </Link>
          {/* fetcher.Form: submits without navigating; loaders revalidate after. */}
          <fetcher.Form method="post" style={{ margin: 0 }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" disabled={deleting} className={dangerButton}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </fetcher.Form>
        </div>
      </td>
    </tr>
  );
}

export default function Posts() {
  const { posts, status } = useLoaderData<Data>();
  const setSearch = useSetSearch<PostsSearch>();

  // Cross-component optimistic UI: every keyed delete fetcher is visible here,
  // no prop drilling — this is what useFetchers() is for.
  const pendingDeletes = useFetchers().filter(
    (f) => f.key.startsWith("delete-post-") && f.state !== "idle",
  ).length;

  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Posts</h1>
        {pendingDeletes > 0 ? (
          <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Deleting {pendingDeletes}…</span>
        ) : null}
        <Link to="/admin/posts/new" className={primaryButton}>
          New post
        </Link>
      </div>

      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            // Typed search write: merges into the URL and re-runs the loader.
            // `undefined` deletes the key; the schema then defaults to "all".
            onClick={() => void setSearch({ status: f === "all" ? undefined : f })}
            className={`${ghostButton} capitalize ${status === f ? "font-extrabold ring-2 ring-slate-900/10" : "font-medium"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState>
          No posts. <Link to="/admin/posts/new">Write one →</Link>
        </EmptyState>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Updated</th>
              <th style={{ width: "1%" }}></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <PostRow key={p.id} post={p} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
