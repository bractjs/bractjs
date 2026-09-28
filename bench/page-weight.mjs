// What a first visit to `url` actually downloads, measured in a real browser
// (installed Google Chrome via playwright-core; nothing is downloaded).
// Collecting scripts from the network — not by scraping <script> tags — counts
// chunks that frameworks load by dynamic import after boot. Also proves the
// page hydrated: the counter button must respond to a click.
//
// Usage: node page-weight.mjs <url>   → prints one JSON object
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";

const url = process.argv[2];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const scripts = new Map(); // url → { encoding, wire } as the browser received it
  const pending = [];
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return;
    const entry = { encoding: res.headers()["content-encoding"] ?? "none", wire: 0 };
    scripts.set(res.url(), entry);
    // Encoded body bytes actually transferred — what compression saves.
    pending.push(
      res
        .finished()
        .then(() => res.request().sizes())
        .then((s) => (entry.wire = s.responseBodySize)),
    );
  });

  const doc = await page.goto(url, { waitUntil: "networkidle" });
  const documentEncoding = doc?.headers()["content-encoding"] ?? "none";

  await Promise.all(pending);

  let hydrated = false;
  try {
    await page.getByRole("button", { name: "Clicked 0 times" }).click({ timeout: 5000 });
    await page.getByRole("button", { name: "Clicked 1 times" }).waitFor({ timeout: 5000 });
    hydrated = true;
  } catch {
    // reported as hydrated: false
  }

  // Re-fetch each body uncompressed and gzip it ourselves, so sizes compare
  // bundles rather than each server's compression settings.
  const sizeOf = async (u) => {
    const body = new Uint8Array(await (await fetch(u)).arrayBuffer());
    return { raw: body.byteLength, gzip: gzipSync(body).byteLength };
  };
  const files = [];
  for (const [u, { encoding, wire }] of scripts)
    files.push({ url: new URL(u).pathname, encoding, wire, ...(await sizeOf(u)) });
  const html = await sizeOf(url);

  console.log(
    JSON.stringify({
      hydrated,
      documentEncoding,
      html,
      js: {
        count: files.length,
        raw: files.reduce((n, f) => n + f.raw, 0),
        gzip: files.reduce((n, f) => n + f.gzip, 0),
        wire: files.reduce((n, f) => n + f.wire, 0),
        files,
      },
    }),
  );
} finally {
  await browser.close();
}
