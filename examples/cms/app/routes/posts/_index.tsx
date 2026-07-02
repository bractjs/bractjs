import { Link, useLoaderData } from "@bractjs/bractjs";
import type { LoaderArgs } from "@bractjs/bractjs";
import { countPublished, listPublished, type PostWithRefs } from "../../models/posts.server.ts";
import { resolvedMenu, type ResolvedMenu } from "../../models/menus.server.ts";
import { PostCard, SiteFrame } from "../../ui.tsx";

const PER_PAGE = 10;
type Data = { posts: PostWithRefs[]; page: number; pages: number; header: ResolvedMenu; footer: ResolvedMenu };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page") ?? "1") || 1);
  const total = countPublished();
  return {
    posts: listPublished({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    header: resolvedMenu("header"),
    footer: resolvedMenu("footer"),
  };
}

export function meta() {
  return [{ title: "All Posts | The Bract Gazette" }];
}

// Public, published content — safe for a CDN to cache briefly and revalidate in
// the background. `headers()` sets response headers on this route's document and
// `/_data` responses. Don't add caching like this to the session-gated /admin
// routes (their loaders read the cookie); keep authed responses uncached.
export function headers(): HeadersInit {
  return { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
}

export default function PostsIndex() {
  const { posts, page, pages, header, footer } = useLoaderData<Data>();
  return (
    <SiteFrame header={header} footer={footer}>
      <h1 className="prose" style={{ marginTop: 0 }}>All Posts</h1>
      <div style={{ display: "grid", gap: "1.4rem" }}>
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
      {pages > 1 ? (
        <nav style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2rem" }}>
          {page > 1 ? <Link to={`/posts?page=${page - 1}`}>← Newer</Link> : <span />}
          <span style={{ color: "var(--muted)" }}>Page {page} of {pages}</span>
          {page < pages ? <Link to={`/posts?page=${page + 1}`}>Older →</Link> : <span />}
        </nav>
      ) : null}
    </SiteFrame>
  );
}
