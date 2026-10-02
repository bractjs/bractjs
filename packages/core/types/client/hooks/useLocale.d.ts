/**
 * The current page's locale. With `i18n` in bractjs.config.ts it is the
 * locale the URL is in (`/fr/about` → `"fr"`, `/about` → the default locale),
 * on the server and in the browser alike — use it for `<html lang>` and
 * message lookups. Without `i18n`, a `locale` route param is used, else
 * `defaultLocale`.
 */
export declare function useLocale(defaultLocale?: string): string;
