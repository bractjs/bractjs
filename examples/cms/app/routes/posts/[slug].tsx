import type { LoaderArgs, MetaArgs } from "@bractjs/bractjs";
import { HttpError, Image, Link, useLoaderData } from "@bractjs/bractjs";
import { type ResolvedField, resolveEntityFields } from "../../models/fields.server.ts";
import type { Media } from "../../models/media.server.ts";
import { type ResolvedMenu, resolvedMenu } from "../../models/menus.server.ts";
import { getPostGallery, getPublishedPostBySlug, type PostWithRefs } from "../../models/posts.server.ts";
import { stripTags } from "../../sanitize.ts";
import { Breadcrumb, CustomFieldsView, SiteFrame } from "../../ui.tsx";

type Data = {
  post: PostWithRefs;
  gallery: Media[];
  fields: ResolvedField[];
  header: ResolvedMenu;
  footer: ResolvedMenu;
};

export async function loader({ params }: LoaderArgs): Promise<Data> {
  const post = getPublishedPostBySlug(params.slug);
  if (!post) throw new HttpError(404, "That story doesn’t exist (or isn’t published).");
  return {
    post,
    gallery: getPostGallery(post.id),
    fields: resolveEntityFields("post", post.id),
    header: resolvedMenu("header"),
    footer: resolvedMenu("footer"),
  };
}

export type LoaderData = Data;

export function meta({ loaderData }: MetaArgs<LoaderData>) {
  const p = loaderData.post;
  const title = p.seoTitle || `${p.title} | The Bract Gazette`;
  const desc = p.seoDescription || p.excerpt || stripTags(p.body).slice(0, 160);
  return [
    { title },
    { name: "description", content: desc },
    { property: "og:title", content: title },
    { property: "og:description", content: desc },
    ...(p.featuredMedia ? [{ property: "og:image", content: p.featuredMedia.url }] : []),
  ];
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <SiteFrame>
      <h1 className="prose">Not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <p>
        <Link to="/posts" style={{ color: "var(--accent)" }}>
          ← All posts
        </Link>
      </p>
    </SiteFrame>
  );
}

export default function PostDetail() {
  const { post, gallery, fields, header, footer } = useLoaderData<Data>();
  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <SiteFrame header={header} footer={footer}>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Posts", to: "/posts" },
          ...(post.category ? [{ label: post.category.name, to: `/category/${post.category.slug}` }] : []),
          { label: post.title },
        ]}
      />
      <article>
        <header style={{ marginBottom: "1.2rem" }}>
          <h1
            style={{
              fontFamily: "var(--display)",
              fontSize: "clamp(2rem, 4vw, 2.8rem)",
              lineHeight: 1.1,
              margin: "0 0 .5rem",
            }}
          >
            {post.title}
          </h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {date}
            {post.authorName ? ` · by ${post.authorName}` : ""}
            {post.category ? (
              <>
                {" "}
                ·{" "}
                <Link to={`/category/${post.category.slug}`} style={{ color: "var(--accent)" }}>
                  {post.category.name}
                </Link>
              </>
            ) : null}
          </p>
        </header>
        {post.featuredMedia ? (
          <Image
            src={post.featuredMedia.url}
            alt={post.featuredMedia.alt}
            width={900}
            height={420}
            priority
            style={{
              width: "100%",
              height: "auto",
              borderRadius: "12px",
              marginBottom: "1.4rem",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div className="prose" dangerouslySetInnerHTML={{ __html: post.body }} />
        <CustomFieldsView fields={fields} />
        {gallery.length > 0 ? (
          <section style={{ marginTop: "2rem" }}>
            <h2 className="prose" style={{ fontSize: "1.2rem" }}>
              Gallery
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: ".6rem",
              }}
            >
              {gallery.map((m) => (
                <Image
                  key={m.id}
                  src={m.url}
                  alt={m.alt}
                  width={320}
                  height={320}
                  style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: "8px" }}
                />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </SiteFrame>
  );
}
