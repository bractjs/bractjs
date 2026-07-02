import type { LoaderArgs } from "@bractjs/bractjs";
import { Link, useLoaderData } from "@bractjs/bractjs";
import { requireAdmin } from "../../auth.server.ts";
import { db } from "../../db.server.ts";

type Stats = {
  posts: number;
  published: number;
  drafts: number;
  pages: number;
  categories: number;
  media: number;
  menus: number;
  users: number;
};

function count(sql: string): number {
  return db.query<{ n: number }, []>(sql).get()?.n ?? 0;
}

export async function loader({ request }: LoaderArgs): Promise<{ stats: Stats }> {
  await requireAdmin(request);
  return {
    stats: {
      posts: count("SELECT COUNT(*) AS n FROM posts"),
      published: count("SELECT COUNT(*) AS n FROM posts WHERE status='published'"),
      drafts: count("SELECT COUNT(*) AS n FROM posts WHERE status='draft'"),
      pages: count("SELECT COUNT(*) AS n FROM pages"),
      categories: count("SELECT COUNT(*) AS n FROM categories"),
      media: count("SELECT COUNT(*) AS n FROM media"),
      menus: count("SELECT COUNT(*) AS n FROM menus"),
      users: count("SELECT COUNT(*) AS n FROM users"),
    },
  };
}

export function meta() {
  return [{ title: "Dashboard | CMS Admin" }];
}

// Selective SSR: the dashboard is behind auth, so SEO is irrelevant — run the
// loader on the server (stats ship in the bootstrap payload) but render the
// component client-only. The Fallback SSRs in its place and is swapped out
// right after hydration.
export const ssr = "data-only";

export function Fallback() {
  return <p style={{ color: "var(--admin-muted)" }}>Loading stats…</p>;
}

const TILES: Array<{ key: keyof Stats; label: string; to: string }> = [
  { key: "posts", label: "Posts", to: "/admin/posts" },
  { key: "pages", label: "Pages", to: "/admin/pages" },
  { key: "categories", label: "Categories", to: "/admin/categories" },
  { key: "media", label: "Media", to: "/admin/media" },
  { key: "menus", label: "Menus", to: "/admin/menus" },
  { key: "users", label: "Users", to: "/admin/users" },
];

export default function Dashboard() {
  const { stats } = useLoaderData<{ stats: Stats }>();
  return (
    <>
      <p style={{ color: "var(--admin-muted)", margin: "0 0 .4rem" }}>
        {stats.published} published · {stats.drafts} draft{stats.drafts === 1 ? "" : "s"}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: ".9rem",
          marginTop: "1rem",
        }}
      >
        {TILES.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className="admin-panel"
            style={{ textDecoration: "none", display: "grid", gap: ".2rem" }}
          >
            <span style={{ fontSize: "2rem", fontWeight: 800 }}>{stats[t.key]}</span>
            <span style={{ color: "var(--muted)", fontWeight: 600 }}>{t.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
