import { describe, expect, test } from "bun:test";
import { sanitizeHtml, stripTags } from "../sanitize.ts";

describe("sanitizeHtml", () => {
  test("keeps allowlisted tags and attributes, drops the rest", () => {
    expect(sanitizeHtml('<p class="x" onclick="evil()">hi <b>there</b></p>')).toBe("<p>hi <b>there</b></p>");
    expect(sanitizeHtml('<a href="https://example.com" title="t" target="_blank">x</a>')).toBe(
      '<a href="https://example.com" title="t" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeHtml('<script>alert(1)</script><img src="/a.png" alt=\'A\' width="10">')).toBe(
      'alert(1)<img src="/a.png" alt="A" width="10" />',
    );
  });

  test("rejects unsafe URLs, keeps safe ones", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href=" JAVASCRIPT:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="data:text/html,x">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="mailto:a@b.c">x</a>')).toBe(
      '<a href="mailto:a@b.c" rel="noopener noreferrer">x</a>',
    );
  });

  test("unquoted attribute values are dropped, and the rest still parses", () => {
    expect(sanitizeHtml('<a href=javascript:x title="ok">x</a>')).toBe('<a title="ok">x</a>');
  });

  test("escapes text and stray angle brackets", () => {
    expect(sanitizeHtml("1 < 2 & 3 > 2 <<b>bold</b>")).toBe("1 &lt; 2 &amp; 3 &gt; 2 &lt;<b>bold</b>");
  });

  test("is linear on hostile input (no regex backtracking blow-up)", () => {
    // Previously ~0.7s at 40k and quadratic from there; a 5 MB body took hours.
    const unclosedTag = "<a" + " ".repeat(400_000);
    const longAttrRun = "<a " + "x".repeat(400_000) + ">";
    const manyAttrs = "<a " + 'q="v" '.repeat(50_000) + ">";
    const longWhitespace = "<a" + " ".repeat(400_000) + ">";
    const nameThenSpaces = "<a " + ("x" + " ".repeat(2_000)).repeat(200) + ">";
    for (const input of [unclosedTag, longAttrRun, manyAttrs, longWhitespace, nameThenSpaces]) {
      const t = performance.now();
      sanitizeHtml(input);
      expect(performance.now() - t).toBeLessThan(500);
    }
  });
});

test("stripTags", () => {
  expect(stripTags("<p>a  <b>b</b></p>\n<br>c")).toBe("a b c");
});
