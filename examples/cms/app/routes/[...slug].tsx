import { Image, Link, useLoaderData } from "@bractjs/bractjs";
import { HttpError } from "@bractjs/bractjs";
import type { LoaderArgs, MetaArgs } from "@bractjs/bractjs";
import { childPages, getPageByPath, pageAncestors, pageFullPath, type Page } from "../models/pages.server.ts";
import { getMedia, type Media } from "../models/media.server.ts";
import { resolvedMenu, type ResolvedMenu } from "../models/menus.server.ts";
import { Breadcrumb, SiteFrame } from "../ui.tsx";

type Crumb = { label: string; href: string };
type ChildLink = { title: string; href: string };
type Data = {
  page: Page;
  featured: Media | null;
  crumbs: Crumb[];
  children: ChildLink[];
  header: ResolvedMenu;
  footer: ResolvedMenu;
};

export async function loader({ params }: LoaderArgs): Promise<Data> {
  const segments = params.slug.split("/").filter(Boolean);
  const page = getPageByPath(segments, { publishedOnly: true });
  if (!page) throw new HttpError(404, "That page doesn’t exist.");
  return {
    page,
    featured: page.featuredMediaId ? getMedia(page.featuredMediaId) : null,
    crumbs: pageAncestors(page.id).map((a) => ({ label: a.title, href: pageFullPath(a.id) })),
    children: childPages(page.id, true).map((c) => ({ title: c.title, href: pageFullPath(c.id) })),
    header: resolvedMenu("header"),
    footer: resolvedMenu("footer"),
  };
}

export type LoaderData = Data;

export function meta({ loaderData }: MetaArgs<LoaderData>) {
  const p = loaderData.page;
  const title = p.seoTitle || `${p.title} | The Bract Gazette`;
  return p.seoDescription ? [{ title }, { name: "description", content: p.seoDescription }] : [{ title }];
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <SiteFrame>
      <h1 className="prose">Page not found</h1>
      <p style={{ color: "var(--muted)" }}>{msg}</p>
      <p><Link to="/" style={{ color: "var(--accent)" }}>← Home</Link></p>
    </SiteFrame>
  );
}

export default function PageView() {
  const { page, featured, crumbs = [], children = [], header, footer } = useLoaderData<Data>();
  return (
    <SiteFrame header={header} footer={footer}>
      <Breadcrumb items={[{ label: "Home", to: "/" }, ...crumbs.map((c) => ({ label: c.label, to: c.href })), { label: page.title }]} />
      <article>
        <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(2rem, 4vw, 2.8rem)", lineHeight: 1.1, margin: "0 0 1rem" }}>{page.title}</h1>
        {featured ? (
          <Image src={featured.url} alt={featured.alt} width={900} height={420} priority style={{ width: "100%", height: "auto", borderRadius: "12px", marginBottom: "1.4rem", objectFit: "cover" }} />
        ) : null}
        <div className="prose" dangerouslySetInnerHTML={{ __html: page.body }} />
        {children.length > 0 ? (
          <nav style={{ marginTop: "2rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
            <h2 className="prose" style={{ fontSize: "1.1rem" }}>In this section</h2>
            <ul>
              {children.map((c) => (
                <li key={c.href}><Link to={c.href} style={{ color: "var(--accent)" }}>{c.title}</Link></li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </SiteFrame>
  );
}
