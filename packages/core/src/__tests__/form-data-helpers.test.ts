import { test, expect, describe } from "bun:test";
import { formText, formValues } from "../shared/form-data.ts";

describe("formText", () => {
  test("returns the string value", () => {
    const fd = new FormData();
    fd.set("id", "42");
    expect(formText(fd, "id")).toBe("42");
  });

  test('returns "" for a missing key', () => {
    expect(formText(new FormData(), "nope")).toBe("");
  });

  test('returns "" for a File value', () => {
    const fd = new FormData();
    fd.set("upload", new File(["x"], "a.txt"));
    expect(formText(fd, "upload")).toBe("");
  });
});

describe("formValues", () => {
  test("collects all string entries (skips files)", () => {
    const fd = new FormData();
    fd.set("a", "1");
    fd.set("b", "2");
    fd.set("file", new File(["x"], "a.txt"));
    expect(formValues(fd)).toEqual({ a: "1", b: "2" });
  });

  test("first occurrence wins for repeated keys", () => {
    const fd = new FormData();
    fd.append("tag", "one");
    fd.append("tag", "two");
    expect(formValues(fd)).toEqual({ tag: "one" });
  });

  test("named subset defaults missing keys to ''", () => {
    const fd = new FormData();
    fd.set("title", "Hello");
    expect(formValues(fd, ["title", "body"])).toEqual({ title: "Hello", body: "" });
  });
});
