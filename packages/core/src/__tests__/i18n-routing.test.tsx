// i18n: locale-prefixed URLs from one set of route files (default locale
// unprefixed), canonical redirects, Accept-Language detection, and the
// server/client matchers agreeing.
import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { matchPatternForPath, setClientI18n } from "../client/nav-utils.ts";
import { validateUserConfig } from "../config/load.ts";
import { buildTrie } from "../server/matcher.ts";
import { handleRequest } from "../server/request-handler.ts";
import { filePathToPattern, pathToSegments } from "../server/scanner.ts";
import { type I18nConfig, localizePath, negotiateLocale, splitLocale } from "../shared/i18n.ts";
import type { LoaderArgs } from "../shared/route-types.ts";

const i18n: I18nConfig = { locales: ["en", "fr", "pt-BR"], defaultLocale: "en" };

describe("splitLocale / localizePath / negotiateLocale", () => {
  test("only configured locales count as prefixes", () => {
    expect(splitLocale("/fr/about", i18n)).toEqual({ locale: "fr", pathname: "/about", prefix: "fr" });
    expect(splitLocale("/fr", i18n)).toEqual({ locale: "fr", pathname: "/", prefix: "fr" });
    expect(splitLocale("/about", i18n)).toEqual({ locale: "en", pathname: "/about", prefix: null });
    expect(splitLocale("/frog/x", i18n).prefix).toBeNull();
  });

  test("localizePath keeps the default unprefixed and re-localizes", () => {
    expect(localizePath("/about", "fr", i18n)).toBe("/fr/about");
    expect(localizePath("/about", "en", i18n)).toBe("/about");
    expect(localizePath("/fr/about?x=1", "pt-BR", i18n)).toBe("/pt-BR/about?x=1");
    expect(localizePath("/fr", "en", i18n)).toBe("/");
    expect(localizePath("/", "fr", i18n)).toBe("/fr");
  });

  test("negotiateLocale honors q-values and base languages", () => {
    expect(negotiateLocale("de;q=0.9, fr;q=0.8", i18n)).toBe("fr");
    expect(negotiateLocale("pt-br", i18n)).toBe("pt-BR");
    expect(negotiateLocale("fr-CA,en;q=0.5", i18n)).toBe("fr");
    expect(negotiateLocale("de", i18n)).toBeUndefined();
    expect(negotiateLocale(null, i18n)).toBeUndefined();
  });

  test("config validation", () => {
    expect(() => validateUserConfig({ i18n })).not.toThrow();
    expect(() => validateUserConfig({ i18n: { locales: ["en"], defaultLocale: "fr" } })).toThrow(
      "defaultLocale",
    );
    expect(() => validateUserConfig({ i18n: { locales: ["en/../x"], defaultLocale: "en" } })).toThrow(
      "locale tags",
    );
  });
});

describe("server routing with i18n", () => {
  const routeFile = (filePath: string) => {
    const urlPattern = filePathToPattern(filePath);
    return { filePath, urlPattern, segments: pathToSegments(urlPattern) };
  };
  const trie = buildTrie([routeFile("routes/_index.tsx"), routeFile("routes/about.tsx")]);
  const page = (name: string) => ({
    loader: ({ context }: LoaderArgs) => ({ locale: context.locale }),
    default: () => createElement("p", null, name),
  });
  const config = {
    appDir: "/nonexistent",
    publicDir: "/nonexistent",
    manifest: { clientEntry: "/c.js", routes: {} },
    moduleRegistry: {
      "root.tsx": { default: () => createElement("main", null, "root") },
      "routes/_index.tsx": page("home"),
      "routes/about.tsx": page("about"),
    },
    i18n,
  };
  const html = (headers: Record<string, string> = {}) => ({ headers: { Accept: "text/html", ...headers } });
  const get = (path: string, init = html()) =>
    handleRequest(new Request(`http://x${path}`, init), trie, config, {});

  test("/fr/about renders routes/about.tsx with context.locale = fr", async () => {
    const res = await get("/fr/about");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"route":{"locale":"fr"}');
    expect(body).toContain('"locale":"fr"');
  });

  test("unprefixed URLs are the default locale; /fr alone is the index", async () => {
    expect(await (await get("/about")).text()).toContain('"route":{"locale":"en"}');
    expect(await (await get("/fr")).text()).toContain('"route":{"locale":"fr"}');
  });

  test("/_data strips the prefix too", async () => {
    const res = await get("/_data?path=" + encodeURIComponent("/pt-BR/about"), {} as never);
    const body = (await res.json()) as { route: { locale: string }; locale: string };
    expect(body.route.locale).toBe("pt-BR");
    expect(body.locale).toBe("pt-BR");
  });

  test("the default-locale prefix redirects to the canonical URL", async () => {
    const res = await get("/en/about?x=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe("/about?x=1");
  });

  test("an unknown prefix is just a path (no match → 404)", async () => {
    expect((await get("/de/about")).status).toBe(404);
  });

  describe("with detect", () => {
    const detectConfig = { ...config, i18n: { ...i18n, detect: true } };
    const getD = (path: string, headers: Record<string, string>) =>
      handleRequest(new Request(`http://x${path}`, html(headers)), trie, detectConfig, {});

    test("a first visit is sent to the preferred locale, once", async () => {
      const res = await getD("/about", { "Accept-Language": "fr-FR,fr;q=0.9" });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/fr/about");
      expect(res.headers.get("Set-Cookie")).toContain("bract-locale=fr");
    });

    test("a visitor with the cookie isn't redirected, and pages remember their locale", async () => {
      const res = await getD("/about", { "Accept-Language": "fr", Cookie: "bract-locale=en" });
      expect(res.status).toBe(200);
      expect(res.headers.get("Set-Cookie")).toContain("bract-locale=en");
    });
  });
});

describe("client matcher", () => {
  afterEach(() => setClientI18n(null));
  const manifest = { clientEntry: "", routes: { "": { file: "" }, about: { file: "" } } };

  test("matches the same routes as the server once i18n is set", () => {
    expect(matchPatternForPath("/fr/about", manifest)).toBeNull();
    setClientI18n(i18n);
    expect(matchPatternForPath("/fr/about", manifest)).toBe("about");
    expect(matchPatternForPath("/fr", manifest)).toBe("");
    expect(matchPatternForPath("/about", manifest)).toBe("about");
  });
});
