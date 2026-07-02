import type { LoaderArgs, MetaArgs } from "@bractjs/bractjs";
import { HttpError, Link, useLoaderData } from "@bractjs/bractjs";
import { type Category, categoryAncestors, getCategoryBySlug } from "../../models/categories.server.ts";
import { type ResolvedMenu, resolvedMenu } from "../../models/menus.server.ts";
import { listPublished, type PostWithRefs } from "../../models/posts.server.ts";
import { Breadcrumb, EmptyState, PostCard, SiteFrame } from "../../ui.tsx";

type Data = {
  category: Category;
  ancestors: Category[];
  posts: PostWithRefs[];
  header: ResolvedMenu;
  footer: ResolvedMenu;
};

export async function loader({ params }: LoaderArgs): Promise<Data> {
  const category = getCategoryBySlug(params.slug);
  if (!category) throw new HttpError(404, "Unknown category.");
  return {
    category,
    ancestors: categoryAncestors(category.id),
    posts: listPublished({ categoryId: category.id }),
    header: resolvedMenu("header"),
    footer: resolvedMenu("footer"),
  };
}

export type LoaderData = Data;

export function meta({ loaderData }: MetaArgs<LoaderData>) {
  const c = loaderData.category;
  const title = c.seoTitle || `${c.name} | The Bract Gazette`;
  const desc = c.seoDescription || c.description;
  return desc ? [{ title }, { name: "description", content: desc }] : [{ title }];
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <SiteFrame>
      <h1 className="prose">Category not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <p>
        <Link to="/" style={{ color: "var(--accent)" }}>
          ← Home
        </Link>
      </p>
    </SiteFrame>
  );
}

export default function CategoryPage() {
  const { category, ancestors, posts, header, footer } = useLoaderData<Data>();
  return (
    <SiteFrame header={header} footer={footer}>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          ...ancestors.map((a) => ({ label: a.name, to: `/category/${a.slug}` })),
          { label: category.name },
        ]}
      />
      <h1 className="prose" style={{ marginTop: 0 }}>
        {category.name}
      </h1>
      {category.description ? (
        <p style={{ color: "var(--muted)", marginTop: "-.5rem" }}>{category.description}</p>
      ) : null}
      {posts.length === 0 ? (
        <EmptyState>No published posts in this category yet.</EmptyState>
      ) : (
        <div style={{ display: "grid", gap: "1.4rem" }}>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </SiteFrame>
  );
}
