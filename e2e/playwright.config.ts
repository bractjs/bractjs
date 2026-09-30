import { defineConfig } from "@playwright/test";

// Browser end-to-end tests against the example apps' PRODUCTION builds
// (`bractjs build` + `bractjs start`), in a real Chrome: hydration, soft
// navigation, forms, error pages and styles — the behavior unit tests can't see.
//
// `channel: "chrome"` drives the installed Google Chrome, so no browser
// download is needed (GitHub's ubuntu-latest runners ship Chrome).
export default defineConfig({
  testDir: "./tests",
  // The todo app keeps its tasks in one in-memory SQLite database, so tests
  // share state: run them one at a time and give each its own task titles.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    cwd: "../examples/todo",
    url: "http://localhost:3000/",
    // Locally, reuse a todo server you already have running on :3000.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
  },
});
