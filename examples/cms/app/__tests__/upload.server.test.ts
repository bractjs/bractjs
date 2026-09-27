import { expect, test } from "bun:test";
import { matchesMagic, saveUpload } from "../upload.server.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

test("an MVG/SVG payload labelled image/png is rejected before it is stored", async () => {
  // ImageTragick-style content: ImageMagick sniffs this as MVG regardless of
  // the .png name, and its coders can read local files.
  const mvg =
    "push graphic-context\nviewbox 0 0 640 480\nimage over 0,0 0,0 'text:/etc/passwd'\npop graphic-context\n";
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  for (const body of [mvg, svg]) {
    const res = await saveUpload(new File([body], "cat.png", { type: "image/png" }));
    expect(res.ok).toBe(false);
  }
});

test("magic bytes must match the claimed raster type", () => {
  expect(matchesMagic("image/png", PNG)).toBe(true);
  expect(matchesMagic("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  expect(matchesMagic("image/gif", new TextEncoder().encode("GIF89a...."))).toBe(true);
  expect(matchesMagic("image/webp", new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe(true);
  // A real PNG claiming to be a JPEG, and unknown types, fail.
  expect(matchesMagic("image/jpeg", PNG)).toBe(false);
  expect(matchesMagic("image/svg+xml", new TextEncoder().encode("<svg/>"))).toBe(false);
});
