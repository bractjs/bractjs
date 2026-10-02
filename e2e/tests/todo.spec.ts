import { expect, type Page, test as base } from "@playwright/test";

// Every test fails on a console error or page error — that is where hydration
// mismatches, failed chunk loads and client crashes show up. `allowErrors`
// lists substrings a test expects (e.g. the 404 of a deliberately missing page).
const test = base.extend<{ allowErrors: string[]; consoleErrors: string[] }>({
  allowErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowErrors }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (!allowErrors.some((allowed) => text.includes(allowed))) errors.push(text);
      });
      page.on("pageerror", (err) => errors.push(err.message));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

/** Resolves once React has hydrated the document (hydrateRoot(document, …)). */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => Object.keys(document).some((k) => k.startsWith("__reactContainer")));
}

/**
 * Mark the current document. The mark survives client-side navigation and
 * form submissions but not a full page load — so `expectSameDocument` proves
 * the router handled something without reloading.
 */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __e2eMark?: number }).__e2eMark = 1;
  });
}
async function expectSameDocument(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __e2eMark?: number }).__e2eMark)).toBe(1);
}

const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

async function addTask(page: Page, title: string): Promise<void> {
  await page.getByLabel("New task").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
}

function taskRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
}

test("the board is styled on first paint and hydrates", async ({ page }) => {
  // Block scripts: what's left is the server-rendered document alone.
  const noJs = await page.context().newPage();
  await noJs.route("**/*.js", (route) => route.abort());
  await noJs.goto("/");
  await expect(noJs.getByRole("heading", { name: "Todo board" })).toBeVisible();
  // The header's teal comes from the extracted Tailwind stylesheet.
  const headerBg = await noJs
    .locator("header")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headerBg).toBe("rgb(15, 139, 141)");
  await noJs.close();

  await page.goto("/");
  await hydrated(page);
  await expect(page.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
});

test("adding a task goes through <Form> without a page load", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await markDocument(page);

  const title = unique("Write e2e tests");
  await addTask(page, title);

  await expect(page.getByText("Task added")).toBeVisible();
  await expect(page.getByLabel("New task")).toHaveValue("");
  await expectSameDocument(page);
});

test("a task can be marked done, reopened and deleted", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const title = unique("Toggle me");
  await addTask(page, title);
  const row = taskRow(page, title);

  const doneCount = page.getByRole("link", { name: /^Done\s*\d+$/ });
  const before = Number((await doneCount.textContent())?.match(/\d+/)?.[0]);

  await row.getByRole("button", { name: "Mark as done" }).click();
  await expect(row.getByRole("button", { name: "Mark as open" })).toBeVisible();
  await expect(doneCount).toHaveText(new RegExp(`^Done\\s*${before + 1}$`));

  await row.getByRole("button", { name: "Mark as open" }).click();
  await expect(row.getByRole("button", { name: "Mark as done" })).toBeVisible();

  await row.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("filter tabs soft-navigate and update the URL", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const title = unique("Open task");
  await addTask(page, title);
  await markDocument(page);

  await page.getByRole("link", { name: /^Done\s*\d+$/ }).click();
  await expect(page).toHaveURL(/\?filter=completed$/);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  await page.getByRole("link", { name: /^Open\s*\d+$/ }).click();
  await expect(page).toHaveURL(/\?filter=active$/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expectSameDocument(page);
});

test("a task opens, renames and returns to the board", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const title = unique("Rename me");
  await addTask(page, title);
  await markDocument(page);

  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const renamed = unique("Renamed");
  await page.getByLabel("Rename task").fill(renamed);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: renamed })).toBeVisible();
  await expect(page.getByText("Task renamed")).toBeVisible();

  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: renamed })).toBeVisible();
  await expectSameDocument(page);
});

test.describe("missing tasks", () => {
  // The document request for a missing task is a deliberate 404.
  test.use({ allowErrors: ["404"] });

  test("an unknown id answers 404 with the ErrorBoundary", async ({ page }) => {
    const res = await page.goto("/no-such-task");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Task not found" })).toBeVisible();
    await hydrated(page);
    // The boundary is interactive after hydration: its link soft-navigates home.
    await markDocument(page);
    await page.getByRole("link", { name: "Back to the board" }).click();
    await expect(page.getByRole("heading", { name: "Todo board" })).toBeVisible();
    await expectSameDocument(page);
  });

  test("client navigation to an unknown id renders the same boundary", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const title = unique("Soon gone");
    await addTask(page, title);
    const href = await page.getByRole("link", { name: title }).getAttribute("href");

    // Delete it in the background (a second tab), then follow the stale link.
    const other = await page.context().newPage();
    await other.goto(href!);
    await other.getByRole("button", { name: "Delete task" }).click();
    await expect(other.getByRole("heading", { name: "Todo board" })).toBeVisible();
    await other.close();

    await markDocument(page);
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { name: "Task not found" })).toBeVisible();
    await expect(page).toHaveURL(href!);
    await expectSameDocument(page);
  });
});

test("the About page's CSS Module class matches between server and browser", async ({ page }) => {
  const res = await page.request.get("/about");
  const serverClass = (await res.text()).match(/<span class="(icon_[^"]+)"/)?.[1];
  expect(serverClass).toMatch(/^icon_/);

  await page.goto("/about");
  await hydrated(page);
  const icon = page.locator(`span.${serverClass}`).first();
  await expect(icon).toBeVisible();
  // Styled by the module: a filled 36px tile.
  await expect(icon).toHaveCSS("width", "36px");
});
