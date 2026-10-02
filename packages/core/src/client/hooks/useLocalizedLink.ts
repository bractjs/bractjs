import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import { localizePath } from "../../shared/i18n.ts";
import { RouterContext } from "../router.tsx";
import { useLocale } from "./useLocale.ts";

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
export function useLocalizedLink(defaultLocale = "en"): (path: string, locale?: string) => string {
  const current = useLocale(defaultLocale);
  const routerCtx = useContext(RouterContext);
  const bractCtx = useContext(BractJSContext);
  const i18n = routerCtx?.i18n ?? bractCtx?.i18n;
  return (path: string, locale = current) => {
    if (i18n) return localizePath(path, locale, i18n);
    // Without i18n config: always prefix, never twice.
    const alreadyPrefixed = path.startsWith(`/${locale}/`) || path === `/${locale}`;
    if (alreadyPrefixed) return path;
    return `/${locale}${path.startsWith("/") ? path : "/" + path}`;
  };
}
