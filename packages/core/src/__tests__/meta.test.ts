import { test, expect, describe } from "bun:test";
import { mergeMeta, renderMetaTags } from "../server/meta.ts";
import type { MetaDescriptor } from "../shared/route-types.ts";

describe("mergeMeta", () => {
  test("keeps single descriptors unchanged", () => {
    const input: MetaDescriptor[] = [
      { title: "Home" },
      { name: "description", content: "A site" },
    ];
    const result = mergeMeta(input);
    expect(result.some((d) => "title" in d && (d as { title: string }).title === "Home")).toBe(true);
    expect(result.some((d) => "name" in d && (d as { name: string }).name === "description")).toBe(true);
  });

  test("last title wins (dedup)", () => {
    const input: MetaDescriptor[] = [
      { title: "First" },
      { title: "Last" },
    ];
    const result = mergeMeta(input);
    const titles = result.filter((d) => "title" in d);
    expect(titles.length).toBe(1);
    expect((titles[0] as { title: string }).title).toBe("Last");
  });

  test("last name descriptor wins for same name key", () => {
    const input: MetaDescriptor[] = [
      { name: "description", content: "old" },
      { name: "description", content: "new" },
    ];
    const result = mergeMeta(input);
    const descs = result.filter((d) => "name" in d && (d as { name: string }).name === "description");
    expect(descs.length).toBe(1);
    expect((descs[0] as { content: string }).content).toBe("new");
  });

  test("last property descriptor wins for same property key", () => {
    const input: MetaDescriptor[] = [
      { property: "og:title", content: "old" },
      { property: "og:title", content: "new" },
    ];
    const result = mergeMeta(input);
    const og = result.filter((d) => "property" in d);
    expect(og.length).toBe(1);
    expect((og[0] as { content: string }).content).toBe("new");
  });

  test("returns empty array for empty input", () => {
    expect(mergeMeta([])).toEqual([]);
  });
});

describe("renderMetaTags", () => {
  test("renders <title> tag", () => {
    const html = renderMetaTags([{ title: "Hello" }]);
    expect(html).toContain("<title>Hello</title>");
  });

  test("renders <meta name> tag", () => {
    const html = renderMetaTags([{ name: "description", content: "A desc" }]);
    expect(html).toContain('name="description"');
    expect(html).toContain('content="A desc"');
  });

  test("renders <meta property> tag", () => {
    const html = renderMetaTags([{ property: "og:title", content: "OG" }]);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('content="OG"');
  });

  test("escapes HTML in title", () => {
    const html = renderMetaTags([{ title: "<script>alert(1)</script>" }]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("returns empty string for empty input", () => {
    expect(renderMetaTags([])).toBe("");
  });
});
