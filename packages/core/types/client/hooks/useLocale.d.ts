/**
 * Returns the current locale from URL params.
 * Works when the router is configured with i18n prefix routes (`/:locale/...`).
 *
 * Falls back to `defaultLocale` when no locale param is present (e.g. SSR without locale prefix).
 */
export declare function useLocale(defaultLocale?: string): string;
