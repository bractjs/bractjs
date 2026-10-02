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
export declare const LOCALE_COOKIE = "bract-locale";
export interface LocaleMatch {
    /** The locale this URL is in. */
    locale: string;
    /** The path without its locale prefix — what route matching sees. */
    pathname: string;
    /** The prefix the URL carried, if any (can be the default locale, which is non-canonical). */
    prefix: string | null;
}
/** Split a pathname into its locale and the path routes match against. */
export declare function splitLocale(pathname: string, i18n: I18nConfig): LocaleMatch;
/**
 * `path` in `locale`: prefixed for any locale but the default. A path that
 * already carries a locale prefix is re-localized, so this also builds a
 * language switcher's links.
 */
export declare function localizePath(path: string, locale: string, i18n: I18nConfig): string;
/**
 * The supported locale an `Accept-Language` header prefers most, if any:
 * exact tags first (`pt-BR`), then a base-language match (`pt-BR` → `pt`).
 */
export declare function negotiateLocale(acceptLanguage: string | null, i18n: I18nConfig): string | undefined;
/** Throw a readable error for an invalid `i18n` config. */
export declare function validateI18n(i18n: unknown): asserts i18n is I18nConfig;
