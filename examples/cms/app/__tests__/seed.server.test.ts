import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Seeding runs at import time, so exercise it in a fresh process per case.
async function bootFreshDb(env: Record<string, string>): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn(
    [process.execPath, "-e", `await import(${JSON.stringify(resolve(import.meta.dir, "../db.server.ts"))})`],
    {
      env: { ...process.env, CMS_DB: ":memory:", SESSION_SECRET: "0123456789abcdef0123", ...env },
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { code, stderr };
}

test("a fresh production DB refuses the demo admin/admin123 seed", async () => {
  const res = await bootFreshDb({ NODE_ENV: "production" });
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("SEED_ADMIN_PASSWORD");
  expect((await bootFreshDb({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: "admin123" })).code).not.toBe(0);
});

test("production seeds with an explicit strong SEED_ADMIN_PASSWORD", async () => {
  const res = await bootFreshDb({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: "correct-horse-battery" });
  expect(res.code).toBe(0);
});
