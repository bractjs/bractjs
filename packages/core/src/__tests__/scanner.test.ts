import { describe, expect, test } from "bun:test";
import {
  filePathToPattern,
  isRouteGroupSegment,
  layoutDirsFromFilePath,
  pathToSegments,
} from "../server/scanner.ts";

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

  test("route group folder adds no URL segment", () => {
    expect(filePathToPattern("routes/(marketing)/about.tsx")).toBe("about");
  });

  test("nested route group strips only the group segment", () => {
    expect(filePathToPattern("routes/(marketing)/blog/[id].tsx")).toBe("blog/[id]");
  });

  test("group wrapping the index → root pattern", () => {
    expect(filePathToPattern("routes/(marketing)/_index.tsx")).toBe("");
  });

  test("[[id]] optional kept in pattern string", () => {
    expect(filePathToPattern("routes/users/[[id]].tsx")).toBe("users/[[id]]");
  });
});

describe("route groups", () => {
  test("isRouteGroupSegment detects (group) but not () or plain", () => {
    expect(isRouteGroupSegment("(marketing)")).toBe(true);
    expect(isRouteGroupSegment("()")).toBe(false);
    expect(isRouteGroupSegment("about")).toBe(false);
    expect(isRouteGroupSegment("[id]")).toBe(false);
  });

  test("layoutDirsFromFilePath includes group folders", () => {
    expect(layoutDirsFromFilePath("routes/(marketing)/blog/[id].tsx")).toEqual([
      "(marketing)",
      "(marketing)/blog",
    ]);
  });

  test("layoutDirsFromFilePath for a top-level route → empty", () => {
    expect(layoutDirsFromFilePath("routes/about.tsx")).toEqual([]);
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

  test("[[id]] → optional segment", () => {
    expect(pathToSegments("users/[[id]]")).toEqual(["users", { optional: "id" }]);
  });

  test("nested static path", () => {
    expect(pathToSegments("a/b/c")).toEqual(["a", "b", "c"]);
  });

  test("mixed static and param", () => {
    expect(pathToSegments("users/[id]/posts")).toEqual(["users", { param: "id" }, "posts"]);
  });
});
