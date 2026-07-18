/**
 * Returns a helper that prepends the current locale to a path.
 *
 * Usage:
 *   const localizedTo = useLocalizedLink();
 *   <Link to={localizedTo('/about')} />  // → /en/about
 */
export declare function useLocalizedLink(defaultLocale?: string): (path: string) => string;
