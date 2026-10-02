import { describe, expect, test } from "bun:test";
import { baseCssHrefs, routeCssHrefs } from "../shared/style-links.tsx";

describe("routeCssHrefs", () => {
  const manifest = {
    routes: {
      "": { file: "", css: ["/build/client/app/routes/_index.css"] },
      about: { file: "", css: ["/a.css", "/a.css"] },
      plain: { file: "" },
    },
  };

  test('the index route\'s key is "" — its CSS must still be linked', () => {
    expect(routeCssHrefs(manifest, "")).toEqual(["/build/client/app/routes/_index.css"]);
  });

  test("dedupes, and returns [] for a route without CSS or no route at all", () => {
    expect(routeCssHrefs(manifest, "about")).toEqual(["/a.css"]);
    expect(routeCssHrefs(manifest, "plain")).toEqual([]);
    expect(routeCssHrefs(manifest, undefined)).toEqual([]);
    expect(routeCssHrefs(manifest, null)).toEqual([]);
  });

  test("base CSS is entry + root, deduped", () => {
    expect(baseCssHrefs({ entryCss: ["/e.css", "/r.css"], rootCss: ["/r.css"] })).toEqual([
      "/e.css",
      "/r.css",
    ]);
  });
});
