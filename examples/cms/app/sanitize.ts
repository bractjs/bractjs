// app/sanitize.ts — a tiny allowlist HTML sanitizer for rendering stored
// post/page bodies. NOT a substitute for a hardened library (DOMPurify) in a
// real app, but enough to keep this example from being an XSS footgun: it drops
// every tag that isn't allowlisted, all event handlers, and dangerous URLs.

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "h1", "h2", "h3", "h4", "blockquote", "pre", "code",
  "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "img", "figure", "figcaption",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
};
const URL_ATTRS = new Set(["href", "src"]);

function safeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("/") || v.startsWith("#")) return true;
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("mailto:");
}

/**
 * Walk the raw HTML token-by-token, emitting only allowlisted tags and
 * attributes. Unknown tags are dropped (their text content is kept).
 */
export function sanitizeHtml(raw: string): string {
  let out = "";
  const re = /<\/?([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\/?>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    out += escapeText(raw.slice(lastIndex, match.index));
    lastIndex = re.lastIndex;

    const full = match[0];
    const tag = match[1].toLowerCase();
    const isClose = full.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (isClose) {
      out += `</${tag}>`;
      continue;
    }

    const attrs = parseAttrs(match[2] ?? "", tag);
    const selfClose = tag === "br" || tag === "hr" || tag === "img";
    out += `<${tag}${attrs}${selfClose ? " /" : ""}>`;
  }
  out += escapeText(raw.slice(lastIndex));
  return out;
}

function parseAttrs(attrString: string, tag: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  let result = "";
  const re = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? "";
    if (!allowed.has(name)) continue;
    if (URL_ATTRS.has(name) && !safeUrl(value)) continue;
    result += ` ${name}="${escapeAttr(value)}"`;
  }
  if (tag === "a" && result.includes("href=")) result += ' rel="noopener noreferrer"';
  return result;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Strip all tags → plain text (for auto-excerpts / meta descriptions). */
export function stripTags(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
