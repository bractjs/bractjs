import { test, expect, describe } from "bun:test";
import { filePathToPattern, pathToSegments } from "../server/scanner.ts";

describe("filePathToPattern", () => {
  test("_index maps to empty pattern (root index)", () => {
    expect(filePathToPattern("routes/_index.tsx")).toBe("");
  });

  test("about.tsx → 'about'", () => {
    expect(filePathToPattern("routes/about.tsx")).toBe("about");
  });

  test("[id].tsx → '[id]'", () => {
    expect(filePathToPattern("routes/blog/[id].tsx")).toBe("blog/[id]");
  });

  test("[...slug].tsx → 'docs/[...slug]'", () => {
    expect(filePathToPattern("routes/docs/[...slug].tsx")).toBe("docs/[...slug]");
  });

  test("nested _index → parent pattern", () => {
    expect(filePathToPattern("routes/blog/_index.tsx")).toBe("blog");
  });

  test("strips .ts extension too", () => {
    expect(filePathToPattern("routes/api/data.ts")).toBe("api/data");
  });
});

describe("pathToSegments", () => {
  test("empty pattern → empty segments", () => {
    expect(pathToSegments("")).toEqual([]);
  });

  test("static segment", () => {
    expect(pathToSegments("about")).toEqual(["about"]);
  });

  test("[id] → param segment", () => {
    expect(pathToSegments("blog/[id]")).toEqual(["blog", { param: "id" }]);
  });

  test("[...slug] → catchAll segment", () => {
    expect(pathToSegments("docs/[...slug]")).toEqual(["docs", { catchAll: "slug" }]);
  });

  test("nested static path", () => {
    expect(pathToSegments("a/b/c")).toEqual(["a", "b", "c"]);
  });

  test("mixed static and param", () => {
    expect(pathToSegments("users/[id]/posts")).toEqual([
      "users",
      { param: "id" },
      "posts",
    ]);
  });
});
