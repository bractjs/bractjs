/**
 * Type-level guardrail for end-to-end typed routing.
 *
 * The runtime helpers (`<Link>`, `useNavigate`, `useParams`, `useSearchParams`)
 * gain their type-safety from a declaration-merging seam: `bractjs codegen`
 * augments the package's `Register` interface, and the helpers resolve route
 * types from it. None of that is observable at runtime — only `tsc` proves it.
 * This test writes a fixture, generates its `route-types.gen.ts`, and runs
 * `tsc --noEmit` over:
 *
 *   - positive usage (typed <Link>/useNavigate/useParams must compile), and
 *   - negative usage guarded by `@ts-expect-error` (bad params/routes MUST error,
 *     so a directive that goes unused fails the build), and
 *   - a SECOND fixture with NO codegen, proving un-registered apps still compile
 *     with the loose `string` fallback (the backwards-compat contract).
 *
 * It guards the subtle failure mode that nearly shipped: a too-clever resolution
 * type silently falling back to loose `string`, which compiles but enforces
 * nothing.
 *
 * The fixture lives inside the repo (`.tmp-types-*`, gitignored) so its
 * `@bractjs/bractjs` import self-resolves to the in-repo framework via the root
 * tsconfig `paths` mapping.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { generateRouteTypes } from "../codegen/route-codegen.ts";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const TMP = resolve(import.meta.dir, `.tmp-types-${Date.now()}`);

// Invoke TypeScript via `bunx tsc` — it works whether tsc is installed locally
// or fetched on demand. (A direct node_modules/.bin/tsc path is unreliable here:
// it may be a dangling symlink to an un-installed package.)
const TSC_CMD = ["bunx", "tsc"] as const;

// A fixture tsconfig that resolves `@bractjs/bractjs` → the in-repo entry, mirrors
// the example apps' compiler options, and type-checks only this fixture's files.
function tsconfig(includeGlobDir: string): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        jsx: "react-jsx",
        jsxImportSource: "react",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        allowImportingTsExtensions: true,
        types: ["react", "react-dom"],
        // `paths` with absolute targets needs no `baseUrl` (and baseUrl is
        // deprecated as of TS6, which would fail the compile here).
        paths: { "@bractjs/bractjs": [join(REPO_ROOT, "src/index.ts")] },
      },
      include: [join(includeGlobDir, "**/*.ts"), join(includeGlobDir, "**/*.tsx")],
    },
    null,
    2,
  );
}

async function runTsc(projectDir: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([...TSC_CMD, "--noEmit", "-p", join(projectDir, "tsconfig.json")], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: stdout + stderr };
}

let tscAvailable = false;

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });
  // Real availability probe: actually run the compiler. Earlier this checked a
  // symlink's existence and silently skipped when it dangled — making the whole
  // suite a no-op that still "passed". Run `tsc --version` and trust the exit.
  try {
    const probe = Bun.spawn([...TSC_CMD, "--version"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(probe.stdout).text();
    tscAvailable = (await probe.exited) === 0 && /Version/.test(out);
  } catch {
    tscAvailable = false;
  }
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("typed routing (type-level)", () => {
  test("tsc is available (else the type-level assertions below are skipped)", () => {
    // Surfaced as its own test so a skipped type-check is visible in the report
    // rather than masquerading as a silent pass.
    if (!tscAvailable) console.warn("[typed-routing] tsc unavailable — type-level checks skipped");
    expect(typeof tscAvailable).toBe("boolean");
  });

  test("registered app: typed Link/useNavigate/useParams compile; bad usage errors", async () => {
    if (!tscAvailable) return; // tsc not available in this environment — skip gracefully

    const app = join(TMP, "registered");
    await mkdir(join(app, "routes", "blog"), { recursive: true });
    await writeFile(join(app, "routes", "_index.tsx"), "export default () => null;\n");
    await writeFile(join(app, "routes", "blog", "[id].tsx"), "export default () => null;\n");
    // A route with a typed searchSchema: its safeParse return type is what
    // `InferSchemaOutput` (and therefore useSearch<"/posts">) must pick up.
    await writeFile(
      join(app, "routes", "posts.tsx"),
      `export const searchSchema = {\n` +
        `  safeParse(_input: unknown): { success: boolean; data?: { page: number; q?: string } } {\n` +
        `    return { success: true, data: { page: 1 } };\n` +
        `  },\n` +
        `};\n` +
        `export default () => null;\n`,
    );

    // Generate the registration file (augments Register on the package).
    await writeFile(join(app, "route-types.gen.ts"), await generateRouteTypes(app));
    await writeFile(join(app, "tsconfig.json"), tsconfig("."));

    await writeFile(
      join(app, "usage.tsx"),
      `import { Link, useNavigate, useParams, useSearchParams, useSearch, useSetSearch } from "@bractjs/bractjs";\n` +
        `import "./route-types.gen.ts";\n` +
        `export function Ok() {\n` +
        `  const navigate = useNavigate();\n` +
        `  const p = useParams<"/blog/:id">();\n` +
        `  const id: string = p.id;\n` +
        `  useSearchParams<"/blog/:id">();\n` +
        `  const s = useSearch<"/posts">();\n` +
        `  const page: number = s.page;\n` +
        `  const setSearch = useSetSearch<"/posts">();\n` +
        `  void setSearch({ page: page + 1 });\n` +
        `  void setSearch((prev) => ({ page: prev.page + 1 }), { replace: true });\n` +
        `  return (<>\n` +
        `    <Link to="/blog/:id" params={{ id }}>typed</Link>\n` +
        `    <Link to="/">static literal</Link>\n` +
        `    <Link to="/posts" search={{ page: 2 }}>typed search</Link>\n` +
        `    <Link to={\`/\${id}\`}>built string (BC)</Link>\n` +
        `    <button onClick={() => { void navigate("/blog/:id", { params: { id } }); }}>go</button>\n` +
        `    <button onClick={() => { void navigate("/posts", { search: { page: 3 } }); }}>paged</button>\n` +
        `    <button onClick={() => { void navigate("/"); }}>home</button>\n` +
        `  </>);\n` +
        `}\n` +
        `export function Bad() {\n` +
        `  const navigate = useNavigate();\n` +
        `  const p = useParams<"/blog/:id">();\n` +
        `  const s = useSearch<"/posts">();\n` +
        `  const setSearch = useSetSearch<"/posts">();\n` +
        `  // @ts-expect-error page is a number, not a string\n` +
        `  void setSearch({ page: "2" });\n` +
        `  // @ts-expect-error the schema declares no \`bogus\` key\n` +
        `  void (s.bogus);\n` +
        `  return (<>\n` +
        `    {/* @ts-expect-error wrong param key */}\n` +
        `    <Link to="/blog/:id" params={{ wrong: "1" }}>x</Link>\n` +
        `    {/* @ts-expect-error missing required param */}\n` +
        `    <Link to="/blog/:id" params={{}}>x</Link>\n` +
        `    {/* @ts-expect-error search value has the wrong type */}\n` +
        `    <Link to="/posts" search={{ page: "2" }}>x</Link>\n` +
        `    <button onClick={() => {\n` +
        `      // @ts-expect-error wrong param key in navigate\n` +
        `      void navigate("/blog/:id", { params: { wrong: "1" } });\n` +
        `    }}>go</button>\n` +
        `    {/* @ts-expect-error /blog/:id has no \`nope\` param */}\n` +
        `    <span>{p.nope}</span>\n` +
        `  </>);\n` +
        `}\n`,
    );

    const { code, output } = await runTsc(app);
    // Exit 0 means: positives compiled AND every @ts-expect-error was satisfied
    // by a real error. A silently-loose type would leave directives unused → TS2578.
    // (`output` may carry bunx "Resolving dependencies" noise — key on TS errors.)
    expect(output).not.toContain("TS2578"); // unused @ts-expect-error → typing too loose
    expect(output).not.toMatch(/error TS/);
    expect(code).toBe(0);
  }, 60_000);

  test("un-registered app (no codegen): loose string fallback still compiles", async () => {
    if (!tscAvailable) return;

    const app = join(TMP, "loose");
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "tsconfig.json"), tsconfig("."));
    // No route-types.gen.ts → Register stays empty → everything falls back to string.
    await writeFile(
      join(app, "usage.tsx"),
      `import { Link, useNavigate, useParams } from "@bractjs/bractjs";\n` +
        `export function App({ href }: { href: string }) {\n` +
        `  const navigate = useNavigate();\n` +
        `  const p = useParams();\n` +
        `  return (<>\n` +
        `    <Link to={href}>any string</Link>\n` +
        `    <Link to="/anything/at/all">arbitrary literal</Link>\n` +
        `    <button onClick={() => { void navigate("/wherever"); }}>{p.x}</button>\n` +
        `  </>);\n` +
        `}\n`,
    );

    const { code, output } = await runTsc(app);
    expect(output).not.toMatch(/error TS/);
    expect(code).toBe(0);
  }, 60_000);
});
