// scripts/seed-demo.ts — idempotent demo content for testing.
//
//   bun run seed:demo        (stop `bun run dev` first — avoids a 2nd WAL writer)
//
// Adds categories, long-form posts, and nested pages. Re-running is safe: rows
// are matched by slug and skipped if they already exist. Bodies are multi-
// section HTML so list/detail/pagination/prose rendering get a real workout.

import { db } from "../app/db.server.ts";
import { createCategory, getCategoryBySlug } from "../app/models/categories.server.ts";
import { createPage } from "../app/models/pages.server.ts";
import { createPost, getPostBySlug } from "../app/models/posts.server.ts";
import { listUsers } from "../app/models/users.server.ts";
import { slugify } from "../app/validation.ts";

const authorId = listUsers()[0]?.id ?? null;
const DAY = 86_400_000;

// ── long-content generator ───────────────────────────────────────────────────
const LEAD = [
  "It is a truth universally acknowledged that a project in want of a demo must be in want of content.",
  "Every framework eventually meets the same question: what does it feel like with real data in it?",
  "Long-form content has a way of exposing the seams a tidy three-item seed never will.",
  "Below the fold is where layout, typography, and pagination quietly earn their keep.",
];
const PARAS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.",
  "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
  "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur at vero eos et accusamus.",
];
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length]!;

/** Build a long, multi-section HTML body keyed off `seed` for variety. */
function longBody(title: string, seed: number): string {
  const parts: string[] = [`<p><strong>${pick(LEAD, seed)}</strong></p>`];
  const sections = 4 + (seed % 3); // 4–6 sections
  for (let s = 0; s < sections; s++) {
    parts.push(
      `<h2>${pick(["Background", "How it works", "In practice", "Trade-offs", "What's next", "A closer look"], s)}</h2>`,
    );
    parts.push(`<p>${pick(PARAS, seed + s)}</p>`);
    parts.push(`<p>${pick(PARAS, seed + s + 2)} ${pick(PARAS, seed + s + 4)}</p>`);
    if (s === 1) {
      parts.push(
        "<ul><li>Predictable, file-based routing.</li><li>Loaders and actions colocated with the route.</li><li>Server modules stay on the server.</li><li>Cookie sessions with a same-origin CSRF gate.</li></ul>",
      );
    }
    if (s === 2) {
      parts.push(`<blockquote><p>“${pick(LEAD, seed + s)}”</p></blockquote>`);
    }
  }
  parts.push(`<p>${pick(PARAS, seed + 1)} <em>${title}</em>.</p>`);
  return parts.join("\n");
}

// ── categories (some nested) ─────────────────────────────────────────────────
const catDefs: Array<{ name: string; desc: string; parent?: string }> = [
  { name: "Technology", desc: "Hardware, software, and everything in between." },
  { name: "Web Dev", desc: "The front and back of the modern web.", parent: "technology" },
  { name: "AI & ML", desc: "Models, agents, and applied machine learning.", parent: "technology" },
  { name: "Science", desc: "Research notes from the natural world." },
  { name: "Space", desc: "Launches, orbits, and the deep field.", parent: "science" },
  { name: "Culture", desc: "Books, film, and the long read." },
  { name: "Business", desc: "Markets, makers, and the bottom line." },
];

const catId: Record<string, string> = {};
let catsAdded = 0;
for (const c of catDefs) {
  const slug = slugify(c.name);
  const existing = getCategoryBySlug(slug);
  if (existing) {
    catId[slug] = existing.id;
    continue;
  }
  const res = createCategory({
    name: c.name,
    slug,
    description: c.desc,
    parentId: c.parent ? (catId[c.parent] ?? null) : null,
    seoTitle: "",
    seoDescription: "",
  });
  if (res.ok && res.id) {
    catId[slug] = res.id;
    catsAdded++;
  }
}

// ── posts (mix of published/draft, spread over the last ~3 weeks) ─────────────
const postDefs: Array<{ title: string; cat?: string; status?: "draft" | "published" }> = [
  { title: "Building a Framework from First Principles", cat: "web-dev" },
  { title: "The Quiet Power of File-Based Routing", cat: "web-dev" },
  { title: "Server Modules and the Art of Not Leaking Secrets", cat: "web-dev" },
  { title: "A Field Guide to Loaders and Actions", cat: "web-dev" },
  { title: "Agents, Tools, and the Long Context Window", cat: "ai-ml" },
  { title: "Evaluating Models Without Fooling Yourself", cat: "ai-ml" },
  { title: "Notes from the Deep Field", cat: "space" },
  { title: "Orbital Mechanics for the Impatient", cat: "space", status: "draft" },
  { title: "On Reading Long Things Slowly", cat: "culture" },
  { title: "The Economics of Open Source", cat: "business" },
  { title: "Latency Is a Feature", cat: "technology" },
  { title: "Draft: Things I Haven't Finished Thinking About", cat: "technology", status: "draft" },
];

let postsAdded = 0;
postDefs.forEach((p, i) => {
  const slug = slugify(p.title);
  if (getPostBySlug(slug)) return;
  const status = p.status ?? "published";
  const res = createPost(
    {
      title: p.title,
      slug,
      body: longBody(p.title, i),
      excerpt: `${pick(LEAD, i)} A longer dispatch on “${p.title}”, with several sections to exercise the prose styles.`,
      status,
      categoryId: p.cat ? (catId[p.cat] ?? null) : null,
      featuredMediaId: null,
      seoTitle: "",
      seoDescription: "",
    },
    authorId,
  );
  if (!res.ok || !res.id) return;
  // Spread dates so the published index sorts realistically (newest first).
  const created = Date.now() - (postDefs.length - i) * 1.5 * DAY;
  db.run("UPDATE posts SET createdAt=?, updatedAt=?, publishedAt=? WHERE id=?", [
    created,
    created,
    status === "published" ? created : null,
    res.id,
  ]);
  postsAdded++;
});

// ── pages (nested, long-form) ────────────────────────────────────────────────
type PageDef = { title: string; parent?: string; order?: number; status?: "draft" | "published" };
const pageDefs: PageDef[] = [
  { title: "Documentation", order: 1 },
  { title: "Getting Started", parent: "documentation", order: 1 },
  { title: "Configuration", parent: "documentation", order: 2 },
  { title: "Deployment", parent: "documentation", order: 3, status: "draft" },
  { title: "Company", order: 2 },
  { title: "Careers", parent: "company", order: 1 },
];

const pageId: Record<string, string> = {};
let pagesAdded = 0;
pageDefs.forEach((p, i) => {
  const slug = slugify(p.title);
  const res = createPage({
    title: p.title,
    slug,
    body: longBody(p.title, i + 3),
    status: p.status ?? "published",
    parentId: p.parent ? (pageId[p.parent] ?? null) : null,
    featuredMediaId: null,
    menuOrder: p.order ?? 0,
    seoTitle: "",
    seoDescription: "",
  });
  if (res.ok && res.id) {
    pageId[slug] = res.id;
    pagesAdded++;
  } else if (!res.ok) {
    // Already exists — record its id so children can still nest under it.
    const row = db
      .query<{ id: string }, [string | null, string]>(
        "SELECT id FROM pages WHERE IFNULL(parentId,'') = IFNULL(?,'') AND slug = ?",
      )
      .get(p.parent ? (pageId[p.parent] ?? null) : null, slug);
    if (row) pageId[slug] = row.id;
  }
});

console.log(
  `✅ demo seed: +${catsAdded} categories, +${postsAdded} posts, +${pagesAdded} pages (existing rows skipped).`,
);
