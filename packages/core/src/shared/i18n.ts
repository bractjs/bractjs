// Locale-prefixed URLs, shared by the server (matching, redirects) and the
// client router (matching, links). The default locale is unprefixed
// (`/about`); every other locale is a leading segment (`/fr/about`).

/** `i18n` in bractjs.config.ts. */
export interface I18nConfig {
  /** Every supported locale, e.g. `["en", "fr", "pt-BR"]`. */
  locales: string[];
  /** The locale for unprefixed URLs. Must be one of `locales`. */
  defaultLocale: string;
  /**
   * Redirect a first visit to an unprefixed URL to the visitor's preferred
   * locale (`Accept-Language`). The choice is remembered in the `bract-locale`
   * cookie, so it happens once and following a link to another locale sticks.
   * Default false.
   */
  detect?: boolean;
}

/** The cookie that remembers the locale a visitor last viewed (with `detect`). */
export const LOCALE_COOKIE = "bract-locale";

export interface LocaleMatch {
  /** The locale this URL is in. */
  locale: string;
  /** The path without its locale prefix — what route matching sees. */
  pathname: string;
  /** The prefix the URL carried, if any (can be the default locale, which is non-canonical). */
  prefix: string | null;
}

/** Split a pathname into its locale and the path routes match against. */
export function splitLocale(pathname: string, i18n: I18nConfig): LocaleMatch {
  const first = pathname.split("/")[1] ?? "";
  if (first && i18n.locales.includes(first)) {
    const rest = pathname.slice(first.length + 1);
    return { locale: first, pathname: rest === "" ? "/" : rest, prefix: first };
  }
  return { locale: i18n.defaultLocale, pathname, prefix: null };
}

/**
 * `path` in `locale`: prefixed for any locale but the default. A path that
 * already carries a locale prefix is re-localized, so this also builds a
 * language switcher's links.
 */
export function localizePath(path: string, locale: string, i18n: I18nConfig): string {
  const [pathname, rest = ""] = splitAt(path);
  const bare = splitLocale(pathname.startsWith("/") ? pathname : `/${pathname}`, i18n).pathname;
  if (locale === i18n.defaultLocale || !i18n.locales.includes(locale)) return bare + rest;
  return (bare === "/" ? `/${locale}` : `/${locale}${bare}`) + rest;
}

function splitAt(path: string): [string, string] {
  const i = path.search(/[?#]/);
  return i === -1 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/**
 * The supported locale an `Accept-Language` header prefers most, if any:
 * exact tags first (`pt-BR`), then a base-language match (`pt-BR` → `pt`).
 */
export function negotiateLocale(acceptLanguage: string | null, i18n: I18nConfig): string | undefined {
  if (!acceptLanguage) return undefined;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((w) => w.tag && w.tag !== "*" && w.q > 0)
    .sort((a, b) => b.q - a.q);
  const byLower = new Map(i18n.locales.map((l) => [l.toLowerCase(), l]));
  for (const { tag } of wanted) {
    const exact = byLower.get(tag);
    if (exact) return exact;
    const base = byLower.get(tag.split("-")[0]);
    if (base) return base;
  }
  return undefined;
}

const LOCALE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Throw a readable error for an invalid `i18n` config. */
export function validateI18n(i18n: unknown): asserts i18n is I18nConfig {
  const c = i18n as Partial<I18nConfig> | null;
  if (!c || typeof c !== "object") throw new Error('"i18n" must be an object { locales, defaultLocale }');
  if (!Array.isArray(c.locales) || c.locales.length === 0 || !c.locales.every((l) => LOCALE_TAG.test(l))) {
    throw new Error('"i18n.locales" must be a non-empty array of locale tags like "en" or "pt-BR"');
  }
  if (typeof c.defaultLocale !== "string" || !c.locales.includes(c.defaultLocale)) {
    throw new Error('"i18n.defaultLocale" must be one of "i18n.locales"');
  }
  if (c.detect !== undefined && typeof c.detect !== "boolean") {
    throw new Error('"i18n.detect" must be a boolean');
  }
}
