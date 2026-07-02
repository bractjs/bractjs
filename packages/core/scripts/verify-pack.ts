// Prepublish gate: assert the npm tarball actually contains what consumers
// need. Run automatically via `prepublishOnly`; fails the publish when the
// `files` allowlist regresses (e.g. LICENSE or the type surface dropped out).
import { resolve } from "node:path";

const pkgDir = resolve(import.meta.dir, "..");

const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
  cwd: pkgDir,
  stdout: "pipe",
  stderr: "pipe",
});
const [out, err, code] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);
if (code !== 0) {
  console.error(`[verify-pack] npm pack --dry-run failed (${code}):\n${err}`);
  process.exit(1);
}

interface PackReport {
  files: Array<{ path: string }>;
}
const report = JSON.parse(out) as PackReport[];
const files = new Set(report[0]?.files.map((f) => f.path) ?? []);

const required = [
  "package.json",
  "LICENSE",
  "README.md",
  "src/index.ts",
  "bin/cli.ts",
  "types/index.d.ts",
  "types/route.d.ts",
  "types/config.d.ts",
  "types/session.d.ts",
  "types/middleware.d.ts",
  "templates/new-app/package.json",
  "templates/new-app/README.md",
];

const missing = required.filter((f) => !files.has(f));
if (missing.length > 0) {
  console.error(`[verify-pack] tarball is missing required files:\n  - ${missing.join("\n  - ")}`);
  process.exit(1);
}

// Nothing generated or secret should ride along.
const forbidden = [...files].filter(
  (f) => f.includes("_generated/") || f.includes("__tests__/") || f.endsWith(".env"),
);
if (forbidden.length > 0) {
  console.error(`[verify-pack] tarball contains files that must not publish:\n  - ${forbidden.join("\n  - ")}`);
  process.exit(1);
}

console.log(`[verify-pack] OK — ${files.size} files, all required entries present.`);
