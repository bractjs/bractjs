// app/ui.tsx — shared UI building blocks, styled with Tailwind utility classes.
//
// The form/button primitives are exported as className strings so route files
// use them as `className={input}` etc. The editorial public chrome (SiteFrame,
// PostCard) and the admin chrome (AdminSidebar) live here too; the chrome's
// layout classes (.admin-*, .site, .prose) are defined in app/styles.css, which
// Tailwind compiles to public/styles.css.

import { Form, Image, Link, toast, useLocation, useMatches } from "@bractjs/bractjs";
import {
  ExternalLink,
  Files,
  FileText,
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  ListTree,
  LogOut,
  Newspaper,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UsersRound,
} from "lucide-react";
import { type ComponentType, Fragment, type ReactNode, useEffect, useRef } from "react";
import { DropZone } from "./components/DropZone.tsx";
import type { ResolvedField } from "./models/fields.server.ts";
import type { MenuNode, ResolvedMenu } from "./models/menus.server.ts";
import type { Permission } from "./permissions.ts";

// ── Form primitives (Tailwind class strings) ─────────────────────────────────

export const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[0.95rem] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
export const textarea = `${input} min-h-32 resize-y`;
export const select = `${input} [appearance:auto]`;
export const primaryButton =
  "inline-flex cursor-pointer items-center gap-2 rounded-lg border-none bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60";
export const ghostButton =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50";
export const dangerButton =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-100";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function Badge({ tone, children }: { tone: "draft" | "published" | "muted"; children: ReactNode }) {
  const cls = {
    draft: "bg-amber-50 text-amber-700 border-amber-200",
    published: "bg-emerald-50 text-emerald-700 border-emerald-200",
    muted: "bg-slate-100 text-slate-500 border-slate-200",
  }[tone];
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[0.72rem] font-bold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

// ── Admin chrome ─────────────────────────────────────────────────────────────

export type AdminUserLite = {
  displayName: string;
  username: string;
  role: string;
  permissions?: Permission[];
};

type NavItem = {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  group: string;
  perm?: Permission;
};
const NAV: NavItem[] = [
  { group: "Content", to: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { group: "Content", to: "/admin/posts", label: "Posts", Icon: FileText, perm: "posts.manage" },
  { group: "Content", to: "/admin/pages", label: "Pages", Icon: Files, perm: "pages.manage" },
  {
    group: "Content",
    to: "/admin/categories",
    label: "Categories",
    Icon: FolderTree,
    perm: "categories.manage",
  },
  { group: "Content", to: "/admin/media", label: "Media", Icon: ImageIcon, perm: "media.manage" },
  { group: "Content", to: "/admin/menus", label: "Menus", Icon: ListTree, perm: "menus.manage" },
  {
    group: "Content",
    to: "/admin/fields",
    label: "Custom Fields",
    Icon: SlidersHorizontal,
    perm: "fields.manage",
  },
  { group: "Administration", to: "/admin/users", label: "Users", Icon: Users, perm: "users.manage" },
  { group: "Administration", to: "/admin/roles", label: "Roles", Icon: ShieldCheck, perm: "roles.manage" },
  { group: "Administration", to: "/admin/groups", label: "Groups", Icon: UsersRound, perm: "roles.manage" },
];

const isActive = (pathname: string, to: string) =>
  to === "/admin" ? pathname === "/admin" : pathname === to || pathname.startsWith(to + "/");

// The admin layout's loader data (`{ user, flash }`) rides in useMatches() even
// though its component isn't mounted — read it from there.
function useAdminLayoutData() {
  const m = useMatches().find((x) => typeof x.id === "string" && x.id.includes("admin/layout"));
  return m?.data as { user?: AdminUserLite; flash?: FlashLite | null } | undefined;
}

type FlashLite = { type: "success" | "error" | "info" | "warning"; message: string };

// Pop the layout's one-shot `flash` (set by a redirecting action) as a toast.
// The cookie is cleared server-side after one read, so `flash` is null on later
// navigations; the ref just guards against a double-fire within this mount.
function useFlashToast(flash: FlashLite | null | undefined) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const key = `${flash.type}:${flash.message}`;
    if (key === last.current) return;
    last.current = key;
    toast[flash.type](flash.message);
  }, [flash?.type, flash?.message]);
}

/** Flat admin chrome: fixed left sidebar + sticky top header, wrapping `children`. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const layout = useAdminLayoutData();
  const user = layout?.user ?? null;
  useFlashToast(layout?.flash);
  const current = [...NAV].reverse().find((n) => isActive(pathname, n.to));
  const initials = (user?.displayName ?? "Admin")
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand">
          <Newspaper size={20} className="text-(--admin-accent)" /> Bract<span className="dot">·</span>
          CMS
        </Link>
        <nav className="admin-nav" aria-label="Admin">
          {NAV.filter((n) => !n.perm || (user?.permissions ?? []).includes(n.perm)).map((n, i, vis) => (
            <Fragment key={n.to}>
              {n.group !== vis[i - 1]?.group ? <div className="admin-section">{n.group}</div> : null}
              <Link to={n.to} className={isActive(pathname, n.to) ? "active" : undefined}>
                <n.Icon size={17} /> {n.label}
              </Link>
            </Fragment>
          ))}
        </nav>
        <div className="admin-user">
          <div className="admin-avatar">{initials}</div>
          <div className="who">
            <strong>{user?.displayName ?? "Admin"}</strong>
            <span>{user?.role ?? "admin"}</span>
          </div>
          <Form method="post" action="/admin/logout" className="m-0" style={{ marginLeft: "auto" }}>
            <button type="submit" className="icon-btn" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </Form>
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-topbar">
          <h2>{current?.label ?? "Admin"}</h2>
          <span className="spacer" />
          <Link to="/" className="icon-btn" aria-label="View site" title="View site">
            <ExternalLink size={16} />
          </Link>
        </header>
        <main className="admin-main">{children}</main>
      </div>
      <DropZone />
    </div>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 ? <span className="mx-1.5">/</span> : null}
          {it.to ? (
            <Link to={it.to} className="text-(--accent) no-underline">
              {it.label}
            </Link>
          ) : (
            <span>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ── Public site frame ────────────────────────────────────────────────────────

export type NavLink = { label: string; href: string };

// Recursive menu render. The root <ul> gets `menuClass` (fallback "site-nav"),
// every nested <ul> gets `submenuClass`, every <li> gets `itemClass` plus that
// item's own `cssClass` — the custom classes set in the menu admin.
function MenuList({
  items,
  ulClass,
  submenuClass,
  itemClass,
}: {
  items: MenuNode[];
  ulClass: string;
  submenuClass: string;
  itemClass: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={ulClass || undefined}>
      {items.map((n) => (
        <li key={n.id} className={[itemClass, n.cssClass].filter(Boolean).join(" ") || undefined}>
          <Link to={n.href}>{n.label}</Link>
          {n.children.length > 0 ? (
            <MenuList
              items={n.children}
              ulClass={submenuClass}
              submenuClass={submenuClass}
              itemClass={itemClass}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function MenuNav({
  menu,
  fallbackClass = "site-nav",
  ariaLabel,
}: {
  menu?: ResolvedMenu;
  fallbackClass?: string;
  ariaLabel?: string;
}) {
  if (!menu || menu.items.length === 0) return null;
  return (
    <nav aria-label={ariaLabel}>
      <MenuList
        items={menu.items}
        ulClass={menu.menuClass || fallbackClass}
        submenuClass={menu.submenuClass}
        itemClass={menu.itemClass}
      />
    </nav>
  );
}

export function SiteFrame({
  header,
  footer,
  children,
}: {
  header?: ResolvedMenu;
  footer?: ResolvedMenu;
  children: ReactNode;
}) {
  return (
    <div className="site">
      <header className="masthead">
        <Link to="/" className="title">
          The Bract Gazette
        </Link>
        <p className="tagline">Stories, pages &amp; dispatches — powered by BractJS</p>
        <MenuNav menu={header} ariaLabel="Primary" />
      </header>
      {children}
      <footer className="site-footer">
        <MenuNav menu={footer} ariaLabel="Footer" />
        <div>
          A BractJS example · admin at <Link to="/admin">/admin</Link>
        </div>
      </footer>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
      {children}
    </div>
  );
}

// A minimal shape so this client-safe module doesn't import server models.
export type PostCardData = {
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: number | null;
  createdAt: number;
  category: { name: string; slug: string } | null;
  featuredMedia: { url: string; alt: string } | null;
};

export function PostCard({ post }: { post: PostCardData }) {
  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <article className="grid gap-2 border-b border-(--line) pb-6">
      {post.featuredMedia ? (
        <Link to={`/posts/${post.slug}`} className="block">
          <Image
            src={post.featuredMedia.url}
            alt={post.featuredMedia.alt}
            width={840}
            height={360}
            className="h-auto w-full rounded-lg object-cover"
          />
        </Link>
      ) : null}
      <div className="flex items-center gap-2.5 text-xs text-slate-500">
        <span>{date}</span>
        {post.category ? (
          <>
            <span>·</span>
            <Link
              to={`/category/${post.category.slug}`}
              className="text-(--accent) no-underline [font-variant:small-caps]"
            >
              {post.category.name}
            </Link>
          </>
        ) : null}
      </div>
      <h2 className="m-0 font-(--display) text-[1.7rem] leading-tight">
        <Link to={`/posts/${post.slug}`} className="no-underline">
          {post.title}
        </Link>
      </h2>
      {post.excerpt ? <p className="m-0 leading-relaxed text-slate-500">{post.excerpt}</p> : null}
    </article>
  );
}

/** Public render of resolved custom fields (see resolveEntityFields). */
export function CustomFieldsView({ fields }: { fields: ResolvedField[] }) {
  if (fields.length === 0) return null;
  return (
    <section style={{ marginTop: "2rem", display: "grid", gap: "1.1rem" }}>
      {fields.map(({ field, values }) => (
        <div key={field.id}>
          <h3 className="prose" style={{ fontSize: "1.05rem", margin: "0 0 .4rem" }}>
            {field.label}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center" }}>
            {values.map((v, i) =>
              v.type === "text" ? (
                <span key={i}>{v.text}</span>
              ) : v.type === "image" ? (
                <Image
                  key={i}
                  src={v.url}
                  alt={v.alt}
                  width={240}
                  height={240}
                  style={{ width: 120, height: 120, objectFit: "cover", borderRadius: "8px" }}
                />
              ) : v.url ? (
                <Link key={i} to={v.url} style={{ color: "var(--accent)", fontWeight: 600 }}>
                  {v.title}
                </Link>
              ) : (
                <span key={i}>{v.title}</span>
              ),
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
