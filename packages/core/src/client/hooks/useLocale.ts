import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import { RouterContext } from "../router.tsx";
import { useParams } from "./useParams.ts";

/**
 * The current page's locale. With `i18n` in bractjs.config.ts it is the
 * locale the URL is in (`/fr/about` → `"fr"`, `/about` → the default locale),
 * on the server and in the browser alike — use it for `<html lang>` and
 * message lookups. Without `i18n`, a `locale` route param is used, else
 * `defaultLocale`.
 */
export function useLocale(defaultLocale = "en"): string {
  const routerCtx = useContext(RouterContext);
  const bractCtx = useContext(BractJSContext);
  const params = useParams<{ locale?: string }>();
  return routerCtx?.locale ?? bractCtx?.locale ?? params.locale ?? defaultLocale;
}
