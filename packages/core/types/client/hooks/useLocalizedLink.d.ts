/**
 * Returns `localize(path, locale?)`, which puts a path in the current locale
 * (or the one given). With `i18n` configured the default locale stays
 * unprefixed and a path already carrying a locale is re-localized, so it also
 * builds a language switcher:
 *
 * ```tsx
 * const localize = useLocalizedLink();
 * <Link to={localize("/about")} />        // /fr/about on a French page, /about on an English one
 * <Link to={localize(pathname, "de")} />  // this page in German
 * ```
 */
export declare function useLocalizedLink(defaultLocale?: string): (path: string, locale?: string) => string;
