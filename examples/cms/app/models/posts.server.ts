import { db, newId, nowTs, tx } from "../db.server.ts";
import type { Category } from "./categories.server.ts";
import type { Media } from "./media.server.ts";

export type PostStatus = "draft" | "published";

export type Post = {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  status: PostStatus;
  categoryId: string | null;
  featuredMediaId: string | null;
  authorId: string | null;
  seoTitle: string;
  seoDescription: string;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
};

export type PostWithRefs = Post & {
  category: Category | null;
  featuredMedia: Media | null;
  authorName: string | null;
};

const WITH_REFS = `
  SELECT p.*,
    c.id AS c_id, c.name AS c_name, c.slug AS c_slug, c.description AS c_description, c.parentId AS c_parentId, c.seoTitle AS c_seoTitle, c.seoDescription AS c_seoDescription, c.createdAt AS c_createdAt,
    m.id AS m_id, m.filename AS m_filename, m.originalName AS m_originalName, m.mimeType AS m_mimeType, m.size AS m_size, m.alt AS m_alt, m.title AS m_title, m.caption AS m_caption, m.description AS m_description, m.url AS m_url, m.createdAt AS m_createdAt,
    u.displayName AS authorName
  FROM posts p
  LEFT JOIN categories c ON c.id = p.categoryId
  LEFT JOIN media m ON m.id = p.featuredMediaId
  LEFT JOIN users u ON u.id = p.authorId
`;

type JoinRow = Post & Record<string, unknown>;

function mapRefs(r: JoinRow): PostWithRefs {
  const category = r.c_id
    ? {
        id: r.c_id as string,
        name: r.c_name as string,
        slug: r.c_slug as string,
        description: r.c_description as string,
        parentId: (r.c_parentId as string) ?? null,
        seoTitle: r.c_seoTitle as string,
        seoDescription: r.c_seoDescription as string,
        createdAt: r.c_createdAt as number,
      }
    : null;
  const featuredMedia = r.m_id
    ? {
        id: r.m_id as string,
        filename: r.m_filename as string,
        originalName: r.m_originalName as string,
        mimeType: r.m_mimeType as string,
        size: r.m_size as number,
        alt: r.m_alt as string,
        title: r.m_title as string,
        caption: r.m_caption as string,
        description: r.m_description as string,
        url: r.m_url as string,
        createdAt: r.m_createdAt as number,
      }
    : null;
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    body: r.body,
    excerpt: r.excerpt,
    status: r.status,
    categoryId: r.categoryId,
    featuredMediaId: r.featuredMediaId,
    authorId: r.authorId,
    seoTitle: r.seoTitle,
    seoDescription: r.seoDescription,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt,
    category,
    featuredMedia,
    authorName: (r.authorName as string) ?? null,
  };
}

export function listPosts(opts: { status?: PostStatus } = {}): Post[] {
  if (opts.status) {
    return db
      .query<Post, [PostStatus]>("SELECT * FROM posts WHERE status = ? ORDER BY updatedAt DESC")
      .all(opts.status);
  }
  return db.query<Post, []>("SELECT * FROM posts ORDER BY updatedAt DESC").all();
}

export function listPublished(
  opts: { categoryId?: string; limit?: number; offset?: number } = {},
): PostWithRefs[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const order = " ORDER BY COALESCE(p.publishedAt, p.createdAt) DESC LIMIT ? OFFSET ?";
  if (opts.categoryId) {
    return db
      .query<JoinRow, [string, number, number]>(
        `${WITH_REFS} WHERE p.status = 'published' AND p.categoryId = ?${order}`,
      )
      .all(opts.categoryId, limit, offset)
      .map(mapRefs);
  }
  return db
    .query<JoinRow, [number, number]>(`${WITH_REFS} WHERE p.status = 'published'${order}`)
    .all(limit, offset)
    .map(mapRefs);
}

export function countPublished(categoryId?: string): number {
  if (categoryId) {
    return (
      db
        .query<{ n: number }, [string]>(
          "SELECT COUNT(*) AS n FROM posts WHERE status='published' AND categoryId = ?",
        )
        .get(categoryId)?.n ?? 0
    );
  }
  return (
    db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM posts WHERE status='published'").get()?.n ?? 0
  );
}

export function getPost(id: string): Post | null {
  return db.query<Post, [string]>("SELECT * FROM posts WHERE id = ?").get(id) ?? null;
}

export function getPostBySlug(slug: string): Post | null {
  return db.query<Post, [string]>("SELECT * FROM posts WHERE slug = ?").get(slug) ?? null;
}

export function getPublishedPostBySlug(slug: string): PostWithRefs | null {
  const row = db
    .query<JoinRow, [string]>(`${WITH_REFS} WHERE p.slug = ? AND p.status = 'published'`)
    .get(slug);
  return row ? mapRefs(row) : null;
}

type WriteInput = {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  status: PostStatus;
  categoryId: string | null;
  featuredMediaId: string | null;
  seoTitle: string;
  seoDescription: string;
};

export function createPost(
  input: WriteInput,
  authorId: string | null,
): { ok: boolean; reason?: string; id?: string } {
  if (getPostBySlug(input.slug)) return { ok: false, reason: "That slug is already in use." };
  const id = newId();
  const now = nowTs();
  db.run(
    "INSERT INTO posts (id, title, slug, body, excerpt, status, categoryId, featuredMediaId, authorId, seoTitle, seoDescription, createdAt, updatedAt, publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      input.title,
      input.slug,
      input.body,
      input.excerpt,
      input.status,
      input.categoryId,
      input.featuredMediaId,
      authorId,
      input.seoTitle,
      input.seoDescription,
      now,
      now,
      input.status === "published" ? now : null,
    ],
  );
  return { ok: true, id };
}

export function updatePost(id: string, input: WriteInput): { ok: boolean; reason?: string } {
  const existing = getPost(id);
  if (!existing) return { ok: false, reason: "Post not found." };
  const clash = getPostBySlug(input.slug);
  if (clash && clash.id !== id) return { ok: false, reason: "That slug is already in use." };
  // Set publishedAt the first time it goes live; keep it on later edits.
  const publishedAt = input.status === "published" ? (existing.publishedAt ?? nowTs()) : existing.publishedAt;
  db.run(
    "UPDATE posts SET title=?, slug=?, body=?, excerpt=?, status=?, categoryId=?, featuredMediaId=?, seoTitle=?, seoDescription=?, updatedAt=?, publishedAt=? WHERE id=?",
    [
      input.title,
      input.slug,
      input.body,
      input.excerpt,
      input.status,
      input.categoryId,
      input.featuredMediaId,
      input.seoTitle,
      input.seoDescription,
      nowTs(),
      publishedAt,
      id,
    ],
  );
  return { ok: true };
}

export function setPostStatus(id: string, status: PostStatus): boolean {
  const post = getPost(id);
  if (!post) return false;
  const publishedAt = status === "published" ? (post.publishedAt ?? nowTs()) : post.publishedAt;
  db.run("UPDATE posts SET status=?, updatedAt=?, publishedAt=? WHERE id=?", [
    status,
    nowTs(),
    publishedAt,
    id,
  ]);
  return true;
}

export function deletePost(id: string): boolean {
  return db.run("DELETE FROM posts WHERE id = ?", [id]).changes > 0;
}

// ── gallery (post_media) ─────────────────────────────────────────────────────

export function getPostGallery(postId: string): Media[] {
  return db
    .query<Media, [string]>(
      "SELECT m.* FROM post_media pm JOIN media m ON m.id = pm.mediaId WHERE pm.postId = ? ORDER BY pm.position ASC",
    )
    .all(postId);
}

export function getPostGalleryIds(postId: string): string[] {
  return db
    .query<{ mediaId: string }, [string]>("SELECT mediaId FROM post_media WHERE postId = ? ORDER BY position")
    .all(postId)
    .map((r) => r.mediaId);
}

export function setPostMedia(postId: string, mediaIds: string[]): void {
  tx(() => {
    db.run("DELETE FROM post_media WHERE postId = ?", [postId]);
    mediaIds.forEach((mediaId, i) => {
      db.run("INSERT OR IGNORE INTO post_media (postId, mediaId, position) VALUES (?,?,?)", [
        postId,
        mediaId,
        i,
      ]);
    });
  });
}
