import { useLocale } from "./useLocale.ts";

/**
 * Returns a helper that prepends the current locale to a path.
 *
 * Usage:
 *   const localizedTo = useLocalizedLink();
 *   <Link to={localizedTo('/about')} />  // → /en/about
 */
export function useLocalizedLink(defaultLocale = "en"): (path: string) => string {
  const locale = useLocale(defaultLocale);
  return (path: string) => {
    // Don't double-prefix if the path already starts with /<locale>.
    const alreadyPrefixed = path.startsWith(`/${locale}/`) || path === `/${locale}`;
    if (alreadyPrefixed) return path;
    return `/${locale}${path.startsWith("/") ? path : "/" + path}`;
  };
}
