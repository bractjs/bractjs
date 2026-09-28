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
  const scripts = new Map(); // url → content-encoding the browser received
  page.on("response", (res) => {
    if (res.request().resourceType() === "script") {
      scripts.set(res.url(), res.headers()["content-encoding"] ?? "none");
    }
  });

  const doc = await page.goto(url, { waitUntil: "networkidle" });
  const documentEncoding = doc?.headers()["content-encoding"] ?? "none";

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
  for (const [u, encoding] of scripts)
    files.push({ url: new URL(u).pathname, encoding, ...(await sizeOf(u)) });
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
        files,
      },
    }),
  );
} finally {
  await browser.close();
}
