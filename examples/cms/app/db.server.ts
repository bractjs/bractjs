// app/db.server.ts
//
// The ONE place that constructs the SQLite handle, runs migrations, and seeds.
// Every model imports `db` from here and never imports another model, so there
// are no cycles. The `.server.ts` suffix keeps this (and the bun:sqlite driver)
// out of the client bundle.
//
// File-backed so content survives restarts. Set CMS_DB to relocate it; this
// matters under `bun build --compile`, where the path is relative to the
// process CWD, not the binary.

import { Database } from "bun:sqlite";
import { ALL_PERMISSIONS, EDITOR_PERMISSIONS } from "./permissions.ts";

// Tests (NODE_ENV=test, set by `bun test`) get a throwaway in-memory DB so the
// suite never touches the real ./cms.db file or its WAL.
const DB_PATH = process.env.CMS_DB ?? (process.env.NODE_ENV === "test" ? ":memory:" : "./cms.db");
export const db = new Database(DB_PATH);
db.run("PRAGMA foreign_keys = ON");
db.run("PRAGMA journal_mode = WAL");

export const newId = (): string => crypto.randomUUID();
export const nowTs = (): number => Date.now();

/** Run `fn` inside a transaction (used for reorders / multi-row writes). */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    displayName  TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'admin',
    email        TEXT,
    provider     TEXT NOT NULL DEFAULT 'password',
    avatarUrl    TEXT,
    sessionEpoch INTEGER NOT NULL DEFAULT 0,
    createdAt    INTEGER NOT NULL
  );

  -- Second factor: a single short-lived 6-digit code per user, stored hashed.
  CREATE TABLE IF NOT EXISTS login_codes (
    userId    TEXT PRIMARY KEY,
    codeHash  TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    attempts  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media (
    id           TEXT PRIMARY KEY,
    filename     TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimeType     TEXT NOT NULL,
    size         INTEGER NOT NULL,
    alt          TEXT NOT NULL DEFAULT '',
    url          TEXT NOT NULL,
    createdAt    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    parentId    TEXT,
    createdAt   INTEGER NOT NULL,
    FOREIGN KEY (parentId) REFERENCES categories(id) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parentId);

  CREATE TABLE IF NOT EXISTS posts (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    body            TEXT NOT NULL DEFAULT '',
    excerpt         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'draft',
    categoryId      TEXT,
    featuredMediaId TEXT,
    authorId        TEXT,
    createdAt       INTEGER NOT NULL,
    updatedAt       INTEGER NOT NULL,
    publishedAt     INTEGER,
    FOREIGN KEY (categoryId)      REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (featuredMediaId) REFERENCES media(id)      ON DELETE SET NULL,
    FOREIGN KEY (authorId)        REFERENCES users(id)      ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_status   ON posts(status);
  CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(categoryId);
  CREATE INDEX IF NOT EXISTS idx_posts_slug     ON posts(slug);

  CREATE TABLE IF NOT EXISTS pages (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL,
    body            TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'draft',
    parentId        TEXT,
    featuredMediaId TEXT,
    menuOrder       INTEGER NOT NULL DEFAULT 0,
    createdAt       INTEGER NOT NULL,
    updatedAt       INTEGER NOT NULL,
    FOREIGN KEY (parentId)        REFERENCES pages(id) ON DELETE RESTRICT,
    FOREIGN KEY (featuredMediaId) REFERENCES media(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parentId);
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_pages_parent_slug ON pages(IFNULL(parentId,''), slug);

  CREATE TABLE IF NOT EXISTS post_media (
    postId   TEXT NOT NULL,
    mediaId  TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (postId, mediaId),
    FOREIGN KEY (postId)  REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS menus (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    location  TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id         TEXT PRIMARY KEY,
    menuId     TEXT NOT NULL,
    label      TEXT NOT NULL,
    type       TEXT NOT NULL,
    pageId     TEXT,
    categoryId TEXT,
    url        TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (menuId)     REFERENCES menus(id)      ON DELETE CASCADE,
    FOREIGN KEY (pageId)     REFERENCES pages(id)      ON DELETE CASCADE,
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_menu_items_menu ON menu_items(menuId, position);

  -- Custom fields (ACF-style). A field_group targets one entity type; its fields
  -- hold text / image / post / page / category references, optionally repeatable.
  CREATE TABLE IF NOT EXISTS field_groups (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    target    TEXT NOT NULL,                 -- 'post' | 'page' | 'category'
    position  INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fields (
    id         TEXT PRIMARY KEY,
    groupId    TEXT NOT NULL,
    label      TEXT NOT NULL,
    name       TEXT NOT NULL,                -- machine key, unique per group
    type       TEXT NOT NULL,                -- 'text' | 'image' | 'post' | 'page' | 'category'
    repeatable INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (groupId) REFERENCES field_groups(id) ON DELETE CASCADE,
    UNIQUE (groupId, name)
  );
  CREATE INDEX IF NOT EXISTS idx_fields_group ON fields(groupId, position);
  CREATE TABLE IF NOT EXISTS field_values (
    entityType TEXT NOT NULL,                -- 'post' | 'page' | 'category'
    entityId   TEXT NOT NULL,
    fieldId    TEXT NOT NULL,
    value      TEXT NOT NULL,                -- JSON: a string, or an array of strings (repeatable)
    PRIMARY KEY (entityType, entityId, fieldId),
    FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_field_values_entity ON field_values(entityType, entityId);

  -- RBAC: roles carry permissions; groups bundle roles + members; users get roles
  -- directly and/or via groups. Effective permissions = union of all of them.
  CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    isSystem    INTEGER NOT NULL DEFAULT 0,   -- 1 = Administrator (undeletable, always all perms)
    createdAt   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS role_permissions (
    roleId     TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (roleId, permission),
    FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    createdAt   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_roles (
    groupId TEXT NOT NULL, roleId TEXT NOT NULL,
    PRIMARY KEY (groupId, roleId),
    FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (roleId)  REFERENCES roles(id)  ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS user_roles (
    userId TEXT NOT NULL, roleId TEXT NOT NULL,
    PRIMARY KEY (userId, roleId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS user_groups (
    userId TEXT NOT NULL, groupId TEXT NOT NULL,
    PRIMARY KEY (userId, groupId),
    FOREIGN KEY (userId)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
  );
`);

// ── Migrations (idempotent) ──────────────────────────────────────────────────
// Add columns to a pre-existing users table created before MFA/OAuth landed.
// `ALTER TABLE ADD COLUMN` is a no-op-or-error per column, so we only add the
// ones that are actually missing.
{
  const cols = new Set(
    db.query<{ name: string }, []>("PRAGMA table_info(users)").all().map((c) => c.name),
  );
  if (!cols.has("email")) db.run("ALTER TABLE users ADD COLUMN email TEXT");
  if (!cols.has("provider")) db.run("ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'password'");
  if (!cols.has("avatarUrl")) db.run("ALTER TABLE users ADD COLUMN avatarUrl TEXT");
}
// SEO / metadata columns (added after launch). Idempotent per column.
{
  const addColumn = (table: string, col: string, decl: string): void => {
    const cols = new Set(db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    if (!cols.has(col)) db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  };
  const TEXT = "TEXT NOT NULL DEFAULT ''";
  // Bumped on password change to revoke a user's other live sessions (the
  // session cookie carries the epoch it was issued at; see auth.server.ts).
  addColumn("users", "sessionEpoch", "INTEGER NOT NULL DEFAULT 0");
  addColumn("media", "title", TEXT);
  addColumn("media", "caption", TEXT);
  addColumn("media", "description", TEXT);
  for (const t of ["posts", "pages", "categories"]) {
    addColumn(t, "seoTitle", TEXT);
    addColumn(t, "seoDescription", TEXT);
  }
  // Nested menus + per-level CSS classes.
  addColumn("menu_items", "parentId", "TEXT");
  addColumn("menu_items", "cssClass", TEXT);
  addColumn("menus", "menuClass", TEXT);
  addColumn("menus", "submenuClass", TEXT);
  addColumn("menus", "itemClass", TEXT);
}
// One account per email (case-folded by the model). Partial index so legacy
// rows without an email don't collide on NULL.
db.run("CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email ON users(email) WHERE email IS NOT NULL");

// ── Seed (idempotent) ────────────────────────────────────────────────────────
// Runs once on a fresh DB so the example boots populated. Guarded by a row
// count so restarts never duplicate.

async function seed() {
  const userCount = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()?.n ?? 0;
  if (userCount > 0) return;

  const now = Date.now();
  const adminId = newId();
  const hash = await Bun.password.hash("admin123");
  // ADMIN_EMAIL is where the seeded admin's second-factor code is sent (and the
  // address Google/Microsoft sign-in matches against). Defaults to a dev inbox.
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
  db.run(
    "INSERT INTO users (id, username, passwordHash, displayName, role, email, provider, createdAt) VALUES (?,?,?,?,?,?,?,?)",
    [adminId, "admin", hash, "Site Admin", "admin", adminEmail, "password", now],
  );

  const catNews = newId();
  const catWorld = newId();
  const catEurope = newId();
  db.run("INSERT INTO categories (id, name, slug, description, parentId, createdAt) VALUES (?,?,?,?,?,?)", [
    catNews, "News", "news", "Latest dispatches.", null, now,
  ]);
  db.run("INSERT INTO categories (id, name, slug, description, parentId, createdAt) VALUES (?,?,?,?,?,?)", [
    catWorld, "World", "world", "Around the globe.", null, now,
  ]);
  db.run("INSERT INTO categories (id, name, slug, description, parentId, createdAt) VALUES (?,?,?,?,?,?)", [
    catEurope, "Europe", "europe", "European desk.", catWorld, now,
  ]);

  const posts: Array<[string, string, string, string, string, string | null, number]> = [
    ["Welcome to the Bract Gazette", "welcome-to-the-bract-gazette",
      "<h2>Hello, world</h2><p>This is a published post rendered from stored HTML. Edit it in the admin.</p>",
      "Our first dispatch from the BractJS newsroom.", "published", catNews, now - 5000],
    ["The framework beat", "the-framework-beat",
      "<p>A look at file-based routing, loaders, and actions — the BractJS way.</p>",
      "Notes from the framework desk.", "published", catWorld, now - 3000],
    ["Draft: upcoming features", "draft-upcoming-features",
      "<p>This one is still a draft, so it should not appear on the public site.</p>",
      "Work in progress.", "draft", catNews, now - 1000],
  ];
  for (const [title, slug, body, excerpt, status, categoryId, createdAt] of posts) {
    db.run(
      "INSERT INTO posts (id, title, slug, body, excerpt, status, categoryId, featuredMediaId, authorId, createdAt, updatedAt, publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [newId(), title, slug, body, excerpt, status, categoryId, null, adminId, createdAt, createdAt,
        status === "published" ? createdAt : null],
    );
  }

  const aboutId = newId();
  db.run("INSERT INTO pages (id, title, slug, body, status, parentId, featuredMediaId, menuOrder, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)", [
    aboutId, "About", "about", "<p>About this publication.</p>", "published", null, null, 0, now, now,
  ]);
  db.run("INSERT INTO pages (id, title, slug, body, status, parentId, featuredMediaId, menuOrder, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)", [
    newId(), "The Team", "team", "<p>Meet the (fictional) team.</p>", "published", aboutId, null, 0, now, now,
  ]);

  const menuId = newId();
  db.run("INSERT INTO menus (id, name, location, createdAt) VALUES (?,?,?,?)", [menuId, "Primary", "header", now]);
  db.run("INSERT INTO menu_items (id, menuId, label, type, pageId, categoryId, url, position) VALUES (?,?,?,?,?,?,?,?)", [
    newId(), menuId, "All Posts", "custom", null, null, "/posts", 0,
  ]);
  db.run("INSERT INTO menu_items (id, menuId, label, type, pageId, categoryId, url, position) VALUES (?,?,?,?,?,?,?,?)", [
    newId(), menuId, "News", "category", null, catNews, null, 1,
  ]);
  db.run("INSERT INTO menu_items (id, menuId, label, type, pageId, categoryId, url, position) VALUES (?,?,?,?,?,?,?,?)", [
    newId(), menuId, "About", "page", aboutId, null, null, 2,
  ]);

  const footerId = newId();
  db.run("INSERT INTO menus (id, name, location, createdAt) VALUES (?,?,?,?)", [footerId, "Footer", "footer", now]);
  db.run("INSERT INTO menu_items (id, menuId, label, type, pageId, categoryId, url, position) VALUES (?,?,?,?,?,?,?,?)", [
    newId(), footerId, "About", "page", aboutId, null, null, 0,
  ]);
}

await seed();

// ── RBAC bootstrap (idempotent, every boot; also upgrades pre-RBAC DBs) ───────
// Guarantees the Administrator role (all permissions, undeletable) and an Editor
// role exist, and back-fills role assignments for any user that has none yet —
// reading their legacy `users.role` column to pick Administrator vs Editor.
{
  const ensureRole = (name: string, description: string, isSystem: boolean): string => {
    const row = db.query<{ id: string }, [string]>("SELECT id FROM roles WHERE name = ?").get(name);
    if (row) return row.id;
    const id = newId();
    db.run("INSERT INTO roles (id, name, description, isSystem, createdAt) VALUES (?,?,?,?,?)", [id, name, description, isSystem ? 1 : 0, nowTs()]);
    return id;
  };
  const adminRoleId = ensureRole("Administrator", "Full access to everything.", true);
  for (const p of ALL_PERMISSIONS) db.run("INSERT OR IGNORE INTO role_permissions (roleId, permission) VALUES (?,?)", [adminRoleId, p]);
  const editorExisted = !!db.query("SELECT 1 FROM roles WHERE name = 'Editor'").get();
  const editorRoleId = ensureRole("Editor", "Manage content, but not users or settings.", false);
  if (!editorExisted) for (const p of EDITOR_PERMISSIONS) db.run("INSERT OR IGNORE INTO role_permissions (roleId, permission) VALUES (?,?)", [editorRoleId, p]);

  const orphans = db.query<{ id: string; role: string }, []>(
    "SELECT u.id, u.role FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.userId = u.id)",
  ).all();
  for (const u of orphans) {
    db.run("INSERT OR IGNORE INTO user_roles (userId, roleId) VALUES (?,?)", [u.id, u.role === "editor" ? editorRoleId : adminRoleId]);
  }
}
