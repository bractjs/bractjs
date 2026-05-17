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
export function wrapRoutesWithLocale(routes: RouteFile[], i18n: I18nConfig): RouteFile[] {
  const prefix = i18n.locales.map((l) => l.replace(/[^A-Za-z0-9_-]/g, "")).join("|");
  if (!prefix) return routes;

  const localized: RouteFile[] = [];
  for (const route of routes) {
    // Prepend the locale param segment to the URL pattern.
    const localizedPattern = route.urlPattern === "" || route.urlPattern === "/"
      ? `[locale]`
      : `[locale]/${route.urlPattern}`;

    localized.push({
      ...route,
      urlPattern: localizedPattern,
      segments: [{ param: "locale" }, ...route.segments],
    });
  }

  // Return both original (for default locale without prefix) and localized routes.
  return [...routes, ...localized];
}

/**
 * Strip a locale prefix from the beginning of a pathname.
 * Returns `{ locale, strippedPathname }` — locale is null when not present.
 */
export function stripLocale(
  pathname: string,
  locales: string[],
): { locale: string | null; strippedPathname: string } {
  const segs = pathname.replace(/^\//, "").split("/");
  const first = segs[0];
  if (first && locales.includes(first)) {
    return {
      locale: first,
      strippedPathname: "/" + segs.slice(1).join("/") || "/",
    };
  }
  return { locale: null, strippedPathname: pathname };
}

/**
 * Build a locale-aware variant of the `/_data` path query string.
 * Injects the locale into params so loaders can read it from context.
 */
export function localizedDataPath(pathname: string, locale: string | null): string {
  if (!locale) return pathname;
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}
