import { db, newId, nowTs } from "../db.server.ts";

export type Media = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  alt: string;
  title: string;
  caption: string;
  description: string;
  url: string;
  createdAt: number;
};

export function listMedia(): Media[] {
  return db.query<Media, []>("SELECT * FROM media ORDER BY createdAt DESC").all();
}

export function getMedia(id: string): Media | null {
  return db.query<Media, [string]>("SELECT * FROM media WHERE id = ?").get(id) ?? null;
}

export function insertMedia(input: {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  alt: string;
  url: string;
}): Media {
  const id = newId();
  db.run(
    "INSERT INTO media (id, filename, originalName, mimeType, size, alt, url, createdAt) VALUES (?,?,?,?,?,?,?,?)",
    [id, input.filename, input.originalName, input.mimeType, input.size, input.alt, input.url, nowTs()],
  );
  return getMedia(id)!;
}

export function updateMedia(
  id: string,
  input: { alt: string; title: string; caption: string; description: string },
): boolean {
  return (
    db.run("UPDATE media SET alt = ?, title = ?, caption = ?, description = ? WHERE id = ?", [
      input.alt,
      input.title,
      input.caption,
      input.description,
      id,
    ]).changes > 0
  );
}

export type MediaRefs = { posts: number; pages: number; menuItems: number; total: number };

/** Count where this media is referenced so the UI can warn before deleting. */
export function mediaReferences(id: string): MediaRefs {
  const n = (sql: string) => db.query<{ n: number }, [string]>(sql).get(id)?.n ?? 0;
  const posts =
    n("SELECT COUNT(*) AS n FROM posts WHERE featuredMediaId = ?") +
    n("SELECT COUNT(*) AS n FROM post_media WHERE mediaId = ?");
  const pages = n("SELECT COUNT(*) AS n FROM pages WHERE featuredMediaId = ?");
  const menuItems = 0;
  return { posts, pages, menuItems, total: posts + pages + menuItems };
}

/**
 * Delete a media row. FKs SET NULL/CASCADE keep the DB consistent. Returns the
 * filename so the route can unlink the file from disk.
 */
export function deleteMedia(id: string): { ok: boolean; reason?: string; filename?: string } {
  const m = getMedia(id);
  if (!m) return { ok: false, reason: "Media not found." };
  db.run("DELETE FROM media WHERE id = ?", [id]);
  return { ok: true, filename: m.filename };
}
