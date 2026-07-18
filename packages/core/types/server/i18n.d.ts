import type { RouteFile } from "./scanner.ts";
export interface I18nConfig {
    locales: string[];
    defaultLocale: string;
}
/**
 * Given a list of route files, return augmented copies that include a
 * `/:locale` prefix in their URL pattern.
 *
 * The original routes are preserved so the framework still works without
 * a locale prefix (SSR with the default locale).
 */
export declare function wrapRoutesWithLocale(routes: RouteFile[], i18n: I18nConfig): RouteFile[];
/**
 * Strip a locale prefix from the beginning of a pathname.
 * Returns `{ locale, strippedPathname }` — locale is null when not present.
 */
export declare function stripLocale(pathname: string, locales: string[]): {
    locale: string | null;
    strippedPathname: string;
};
/**
 * Build a locale-aware variant of the `/_data` path query string.
 * Injects the locale into params so loaders can read it from context.
 */
export declare function localizedDataPath(pathname: string, locale: string | null): string;
