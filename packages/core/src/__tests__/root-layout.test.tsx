// root.tsx's `Layout` export (React Router's root Layout) and the app-styled
// 404 for URLs no route matches.
import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { Outlet } from "../client/components/Outlet.tsx";
import { buildTrie } from "../server/matcher.ts";
import { handleRequest } from "../server/request-handler.ts";
import { filePathToPattern, pathToSegments } from "../server/scanner.ts";
import { renderSpaShell } from "../server/spa.ts";
import { HttpError } from "../shared/errors.ts";

function routeFile(filePath: string) {
  const urlPattern = filePathToPattern(filePath);
  return { filePath, urlPattern, segments: pathToSegments(urlPattern) };
}

const Layout = ({ children }: { children?: ReactNode }) =>
  createElement(
    "html",
    { lang: "fr" },
    createElement("head", null, createElement("meta", { charSet: "utf-8" })),
    createElement("body", null, createElement("header", { id: "chrome" }, "My App"), children),
  );

const root = {
  Layout,
  loader: () => ({ user: "ada" }),
  default: ({ loaderData }: { loaderData?: { user: string } }) =>
    createElement("main", { id: "root", "data-user": loaderData?.user }, createElement(Outlet)),
  ErrorBoundary: ({ error }: { error: unknown }) =>
    createElement(
      "p",
      { id: "root-boundary" },
      `${(error as { status?: number }).status ?? 500}:${(error as Error).message}`,
    ),
};

const trie = buildTrie([routeFile("routes/_index.tsx")]);
const registry = {
  "root.tsx": root,
  "routes/_index.tsx": { default: () => createElement("p", { id: "home" }, "home") },
};
const config = {
  appDir: "/nonexistent",
  publicDir: "/nonexistent",
  manifest: { clientEntry: "/c.js", rootCss: ["/build/client/root.css"], routes: {} },
  moduleRegistry: registry,
};
const html = { Accept: "text/html,application/xhtml+xml" };

describe("root Layout export", () => {
  test("wraps the root component in the app's document", async () => {
    const res = await handleRequest(new Request("http://x/", { headers: html }), trie, config, {});
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<html lang="fr">');
    expect(body).toContain('<header id="chrome">My App</header>');
    expect(body).toContain('data-user="ada"');
    expect(body).toContain('<p id="home">home</p>');
  });

  test("a failed root loader renders root's ErrorBoundary inside the Layout", async () => {
    const failing = {
      ...config,
      moduleRegistry: {
        ...registry,
        "root.tsx": {
          ...root,
          loader: () => {
            throw new HttpError(503, "maintenance");
          },
        },
      },
    };
    const res = await handleRequest(new Request("http://x/", { headers: html }), trie, failing, {});
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain('<html lang="fr">');
    expect(body).toContain("My App");
    expect(body).toContain('<p id="root-boundary">503:maintenance</p>');
    expect(body).toContain("/build/client/root.css");
    expect(body).not.toContain('id="root"');
    expect(body).not.toContain("__BRACTJS_DATA__");
  });

  test("the SPA shell renders inside the Layout too", async () => {
    const shell = await renderSpaShell("/nonexistent", config.manifest, registry);
    expect(shell).toContain('<html lang="fr">');
    expect(shell).toContain('id="root"');
  });
});

describe("unmatched URLs", () => {
  test("a browser gets the app's own 404: root chrome + root's ErrorBoundary", async () => {
    const res = await handleRequest(
      new Request("http://x/no/such/page", { headers: html }),
      trie,
      config,
      {},
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("My App");
    expect(body).toContain('data-user="ada"');
    expect(body).toContain('<p id="root-boundary">404:Not Found</p>');
    // It hydrates: the route slot carries the 404 for the client <Outlet>.
    expect(body).toContain('"route":{"__error":{"message":"Not Found","status":404}}');
  });

  test("without a root ErrorBoundary, the built-in fallback renders", async () => {
    const { ErrorBoundary: _omit, ...bare } = root;
    const res = await handleRequest(
      new Request("http://x/nope", { headers: html }),
      trie,
      {
        ...config,
        moduleRegistry: { ...registry, "root.tsx": bare },
      },
      {},
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('data-bract-error="404"');
  });

  test("non-document requests keep the plain 404", async () => {
    const res = await handleRequest(new Request("http://x/missing.png"), trie, config, {});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
    const post = await handleRequest(
      new Request("http://x/nope", { method: "POST", headers: { ...html, Origin: "http://x" } }),
      trie,
      config,
      {},
    );
    expect(post.status).toBe(404);
    expect(post.headers.get("Content-Type")).toContain("application/json");
  });
});
