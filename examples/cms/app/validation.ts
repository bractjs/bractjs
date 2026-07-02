// app/validation.ts
//
// Dependency-free schemas in the Zod/Valibot `.safeParse()` shape that
// BractJS's validate() accepts. In a real app you'd swap in Zod.

export type Issue = { path: string[]; message: string };
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Issue[] } };

export interface SchemaLike<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set([
  "posts", "category", "admin", "api", "_data", "_action", "_image", "_stream", "public", "build",
]);

type R = Record<string, unknown>;
const str = (o: R, k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
const trimmed = (o: R, k: string) => str(o, k).trim();

// Shared SEO override fields (blank = fall back to the entity's title/excerpt).
export type SeoFields = { seoTitle: string; seoDescription: string };
function parseSeo(o: R, issues: Issue[]): SeoFields {
  const seoTitle = trimmed(o, "seoTitle");
  const seoDescription = trimmed(o, "seoDescription");
  if (seoTitle.length > 70) issues.push({ path: ["seoTitle"], message: "SEO title is too long (max 70)." });
  if (seoDescription.length > 200) issues.push({ path: ["seoDescription"], message: "SEO description is too long (max 200)." });
  return { seoTitle, seoDescription };
}

function makeSlugIssue(value: string, field = "slug"): Issue | null {
  if (value.length === 0) return { path: [field], message: "Slug is required." };
  if (!SLUG_RE.test(value)) return { path: [field], message: "Use lowercase letters, numbers and hyphens only." };
  if (RESERVED_SLUGS.has(value)) return { path: [field], message: `"${value}" is reserved.` };
  return null;
}

// ── schemas ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginInput = { username: string; password: string };
export const LoginSchema: SchemaLike<LoginInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const username = trimmed(o, "username");
    const password = str(o, "password");
    if (!username) issues.push({ path: ["username"], message: "Username is required." });
    if (!password) issues.push({ path: ["password"], message: "Password is required." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { username, password } };
  },
};

export type CodeInput = { code: string };
export const CodeSchema: SchemaLike<CodeInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const code = str(o, "code").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      return { success: false, error: { issues: [{ path: ["code"], message: "Enter the 6-digit code." }] } };
    }
    return { success: true, data: { code } };
  },
};

export type CategoryInput = { name: string; slug: string; description: string; parentId: string | null } & SeoFields;
export const CategorySchema: SchemaLike<CategoryInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const name = trimmed(o, "name");
    const slug = trimmed(o, "slug") || slugify(name);
    const description = trimmed(o, "description");
    const parentId = trimmed(o, "parentId") || null;
    if (!name) issues.push({ path: ["name"], message: "Name is required." });
    if (name.length > 120) issues.push({ path: ["name"], message: "Name is too long." });
    const s = makeSlugIssue(slug);
    if (s) issues.push(s);
    if (description.length > 500) issues.push({ path: ["description"], message: "Description is too long." });
    const seo = parseSeo(o, issues);
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { name, slug, description, parentId, ...seo } };
  },
};

export type PostInput = {
  title: string; slug: string; body: string; excerpt: string;
  status: "draft" | "published"; categoryId: string | null; featuredMediaId: string | null;
} & SeoFields;
export const PostSchema: SchemaLike<PostInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const title = trimmed(o, "title");
    const slug = trimmed(o, "slug") || slugify(title);
    const body = str(o, "body");
    const excerpt = trimmed(o, "excerpt");
    const status = str(o, "status") === "published" ? "published" : "draft";
    const categoryId = trimmed(o, "categoryId") || null;
    const featuredMediaId = trimmed(o, "featuredMediaId") || null;
    if (!title) issues.push({ path: ["title"], message: "Title is required." });
    if (title.length > 200) issues.push({ path: ["title"], message: "Title is too long." });
    const s = makeSlugIssue(slug);
    if (s) issues.push(s);
    if (excerpt.length > 300) issues.push({ path: ["excerpt"], message: "Excerpt is too long." });
    const seo = parseSeo(o, issues);
    return issues.length
      ? { success: false, error: { issues } }
      : { success: true, data: { title, slug, body, excerpt, status, categoryId, featuredMediaId, ...seo } };
  },
};

export type PageInput = {
  title: string; slug: string; body: string; status: "draft" | "published";
  parentId: string | null; featuredMediaId: string | null; menuOrder: number;
} & SeoFields;
export const PageSchema: SchemaLike<PageInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const title = trimmed(o, "title");
    const slug = trimmed(o, "slug") || slugify(title);
    const body = str(o, "body");
    const status = str(o, "status") === "published" ? "published" : "draft";
    const parentId = trimmed(o, "parentId") || null;
    const featuredMediaId = trimmed(o, "featuredMediaId") || null;
    const menuOrder = Number.parseInt(trimmed(o, "menuOrder") || "0", 10) || 0;
    if (!title) issues.push({ path: ["title"], message: "Title is required." });
    if (title.length > 200) issues.push({ path: ["title"], message: "Title is too long." });
    const s = makeSlugIssue(slug);
    if (s) issues.push(s);
    const seo = parseSeo(o, issues);
    return issues.length
      ? { success: false, error: { issues } }
      : { success: true, data: { title, slug, body, status, parentId, featuredMediaId, menuOrder, ...seo } };
  },
};

export type MediaInput = { alt: string; title: string; caption: string; description: string };
export const MediaSchema: SchemaLike<MediaInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const alt = trimmed(o, "alt");
    const title = trimmed(o, "title");
    const caption = trimmed(o, "caption");
    const description = trimmed(o, "description");
    if (alt.length > 200) issues.push({ path: ["alt"], message: "Alt text is too long." });
    if (title.length > 200) issues.push({ path: ["title"], message: "Title is too long." });
    if (caption.length > 300) issues.push({ path: ["caption"], message: "Caption is too long." });
    if (description.length > 500) issues.push({ path: ["description"], message: "Description is too long." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { alt, title, caption, description } };
  },
};

export type MenuInput = { name: string; location: "header" | "footer" };
export const MenuSchema: SchemaLike<MenuInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const name = trimmed(o, "name");
    const location = str(o, "location") === "footer" ? "footer" : "header";
    if (!name) issues.push({ path: ["name"], message: "Name is required." });
    if (name.length > 80) issues.push({ path: ["name"], message: "Name is too long." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { name, location } };
  },
};

export type MenuItemInput = {
  label: string; type: "page" | "category" | "custom";
  pageId: string | null; categoryId: string | null; url: string | null;
};
export const MenuItemSchema: SchemaLike<MenuItemInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const label = trimmed(o, "label");
    const rawType = str(o, "type");
    const type = rawType === "page" || rawType === "category" || rawType === "custom" ? rawType : "custom";
    const pageId = trimmed(o, "pageId") || null;
    const categoryId = trimmed(o, "categoryId") || null;
    const url = trimmed(o, "url") || null;
    if (!label) issues.push({ path: ["label"], message: "Label is required." });
    if (type === "page" && !pageId) issues.push({ path: ["pageId"], message: "Pick a page." });
    if (type === "category" && !categoryId) issues.push({ path: ["categoryId"], message: "Pick a category." });
    if (type === "custom" && !url) issues.push({ path: ["url"], message: "Enter a URL." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { label, type, pageId, categoryId, url } };
  },
};

// Exported as values (client-safe): the field routes render these as <select>
// options. They can't import the equivalents from fields.server.ts — value
// (non-function) exports of a *.server.ts module aren't reproduced by the
// client-side server-module stub, so the import would fail the client build.
export const FIELD_TARGETS = ["post", "page", "category"] as const;
export const FIELD_KINDS = ["text", "image", "post", "page", "category"] as const;
const KEY_RE = /^[a-z][a-z0-9_]*$/;

export type FieldGroupInput = { name: string; target: (typeof FIELD_TARGETS)[number] };
export const FieldGroupSchema: SchemaLike<FieldGroupInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const name = trimmed(o, "name");
    const target = FIELD_TARGETS.includes(str(o, "target") as never) ? (str(o, "target") as FieldGroupInput["target"]) : "post";
    if (!name) issues.push({ path: ["name"], message: "Name is required." });
    if (name.length > 80) issues.push({ path: ["name"], message: "Name is too long." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { name, target } };
  },
};

export type FieldInput = { label: string; name: string; type: (typeof FIELD_KINDS)[number]; repeatable: boolean };
export const FieldSchema: SchemaLike<FieldInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const label = trimmed(o, "label");
    const name = (trimmed(o, "name") || slugify(label)).replace(/-/g, "_");
    const type = FIELD_KINDS.includes(str(o, "type") as never) ? (str(o, "type") as FieldInput["type"]) : "text";
    const repeatable = str(o, "repeatable") === "on" || str(o, "repeatable") === "true";
    if (!label) issues.push({ path: ["label"], message: "Label is required." });
    if (!KEY_RE.test(name)) issues.push({ path: ["name"], message: "Key must start with a letter; use lowercase letters, numbers, underscores." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { label, name, type, repeatable } };
  },
};

export type NamedInput = { name: string; description: string };
function namedSchema(maxName = 80): SchemaLike<NamedInput> {
  return {
    safeParse(input) {
      const o = (input ?? {}) as R;
      const issues: Issue[] = [];
      const name = trimmed(o, "name");
      const description = trimmed(o, "description");
      if (!name) issues.push({ path: ["name"], message: "Name is required." });
      if (name.length > maxName) issues.push({ path: ["name"], message: "Name is too long." });
      return issues.length ? { success: false, error: { issues } } : { success: true, data: { name, description } };
    },
  };
}
export const RoleSchema = namedSchema();
export const GroupSchema = namedSchema();

export type UserInput = { username: string; displayName: string; email: string; role: string; password: string };
export const UserCreateSchema: SchemaLike<UserInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const username = trimmed(o, "username");
    const displayName = trimmed(o, "displayName") || username;
    const email = trimmed(o, "email").toLowerCase();
    const role = str(o, "role") === "editor" ? "editor" : "admin";
    const password = str(o, "password");
    if (!username) issues.push({ path: ["username"], message: "Username is required." });
    if (username.length > 64) issues.push({ path: ["username"], message: "Username is too long." });
    if (!EMAIL_RE.test(email)) issues.push({ path: ["email"], message: "Enter a valid email (used for the 2FA code)." });
    if (password.length < 6) issues.push({ path: ["password"], message: "Password must be at least 6 characters." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { username, displayName, email, role, password } };
  },
};

export type UserEditInput = { displayName: string; email: string; password: string };
export const UserEditSchema: SchemaLike<UserEditInput> = {
  safeParse(input) {
    const o = (input ?? {}) as R;
    const issues: Issue[] = [];
    const displayName = trimmed(o, "displayName");
    const email = trimmed(o, "email").toLowerCase();
    const password = str(o, "password");
    if (!displayName) issues.push({ path: ["displayName"], message: "Display name is required." });
    if (!EMAIL_RE.test(email)) issues.push({ path: ["email"], message: "Enter a valid email (used for the 2FA code)." });
    if (password.length > 0 && password.length < 6) issues.push({ path: ["password"], message: "Password must be at least 6 characters." });
    return issues.length ? { success: false, error: { issues } } : { success: true, data: { displayName, email, password } };
  },
};
