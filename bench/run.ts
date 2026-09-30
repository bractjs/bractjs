// BractJS vs React Router 8 vs Next.js on one identical page — see
// docs/benchmarks.md for the methodology and the latest results.
//
//   cd bench && npm run setup && bun run run.ts [--rounds 3] [--duration 10] [--connections 50]
//
// Each app is built for production and served by its framework's standard
// production server on its standard runtime (BractJS on Bun, the others on
// Node). Per app: clean build time, cold start to first 200, first-visit page
// weight in a real browser (with a hydration check), then autocannon load
// against `/` (warmup + N measured rounds; the median round is reported), and
// the server's resident memory after load.
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, totalmem } from "node:os";
import { join } from "node:path";

const BENCH = import.meta.dir;
const CLI = join(BENCH, "../packages/core/bin/cli.ts");
// Not "bun": `bun run` puts the workspace's node_modules/.bin first on PATH,
// where "bun" is a shim for the pinned dev copy (and killing a shim orphans
// the real server). Use the exact binary running this script.
const BUN = process.execPath;
const LOGS = join(BENCH, "results", "logs");

function flag(name: string, fallback: number): number {
  const i = Bun.argv.indexOf(`--${name}`);
  return i > 0 ? Number(Bun.argv[i + 1]) : fallback;
}
const ROUNDS = flag("rounds", 3);
const DURATION = flag("duration", 10);
const CONNECTIONS = flag("connections", 50);
const WARMUP = 5;
const ACCEPT_ENCODING = "gzip, deflate, br, zstd";

interface App {
  name: string;
  dir: string;
  port: number;
  clean: string[];
  build: string[];
  start: string[];
}

const APPS: App[] = [
  {
    name: "BractJS",
    dir: "apps/bractjs",
    port: 4101,
    clean: ["build"],
    build: [BUN, CLI, "build"],
    start: [BUN, CLI, "start"],
  },
  {
    name: "React Router 8",
    dir: "apps/react-router",
    port: 4102,
    clean: ["build", ".react-router"],
    build: ["node", "node_modules/.bin/react-router", "build"],
    start: ["node", "node_modules/.bin/react-router-serve", "./build/server/index.js"],
  },
  {
    name: "Next.js",
    dir: "apps/next",
    port: 4103,
    clean: [".next"],
    build: ["node", "node_modules/.bin/next", "build"],
    start: ["node", "node_modules/.bin/next", "start", "-p", "4103"],
  },
];

const env = (port: number) => ({
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  NEXT_TELEMETRY_DISABLED: "1",
});

async function run(cmd: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, env: { ...env(0), ...extraEnv }, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed in ${cwd}:\n${out}\n${err}`);
  return out;
}

/** A process and all its descendants as [pid, rssKb] (next start may fork). */
async function processTree(pid: number): Promise<Array<[number, number]>> {
  const table = (await run(["ps", "-A", "-o", "pid=,ppid=,rss="], BENCH))
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number));
  const pids = new Set([pid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [p, pp] of table) {
      if (pids.has(pp) && !pids.has(p)) {
        pids.add(p);
        grew = true;
      }
    }
  }
  return table.filter(([p]) => pids.has(p)).map(([p, , rss]) => [p, rss]);
}

async function killTree(pid: number): Promise<void> {
  const tree = await processTree(pid);
  const signal = (sig: NodeJS.Signals) => {
    for (const [p] of tree) {
      try {
        process.kill(p, sig);
      } catch {
        // already exited
      }
    }
  };
  signal("SIGTERM");
  await Bun.sleep(1000);
  signal("SIGKILL");
}

async function waitFor200(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).status === 200) return;
    } catch {
      // not listening yet
    }
    await Bun.sleep(10);
  }
  throw new Error(`${url} did not return 200 within ${timeoutMs} ms`);
}

async function autocannon(url: string, seconds: number) {
  const out = await run(
    [
      "node",
      "node_modules/.bin/autocannon",
      "-j",
      "-c",
      String(CONNECTIONS),
      "-d",
      String(seconds),
      // What every browser sends: each server pays for the compression it does
      // in real use (autocannon sends no Accept-Encoding by default).
      "-H",
      `accept-encoding=${ACCEPT_ENCODING}`,
      url,
    ],
    BENCH,
  );
  const r = JSON.parse(out);
  return {
    rps: r.requests.average as number,
    p50: r.latency.p50 as number,
    p99: r.latency.p99 as number,
    errors: (r.errors as number) + (r.timeouts as number) + (r.non2xx as number),
  };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// ── Preflight: the workload must be byte-identical in every app ────────────
const shared = readFileSync(join(BENCH, "shared/data.ts"), "utf8");
for (const app of APPS) {
  if (readFileSync(join(BENCH, app.dir, "app/data.ts"), "utf8") !== shared) {
    throw new Error(`${app.dir}/app/data.ts differs from shared/data.ts — copy it over`);
  }
}

// ── Load-generator ceiling: autocannon against a server that does no work ──
// If a framework comes close to this, the numbers measure autocannon, not it.
mkdirSync(LOGS, { recursive: true });
const ceilingServer = Bun.serve({
  port: 4100,
  fetch: () => new Response("<!doctype html><p>ok</p>", { headers: { "Content-Type": "text/html" } }),
});
const ceilingRps = Math.round((await autocannon("http://localhost:4100/", DURATION)).rps);
ceilingServer.stop(true);
console.log(`load-generator ceiling: ${ceilingRps} req/s`);

interface Result {
  name: string;
  buildSeconds: number;
  coldStartMs: number;
  rps: number;
  p50Ms: number;
  p99Ms: number;
  rssMbAfterLoad: number;
  jsGzipKb: number;
  jsRawKb: number;
  jsWireKb: number;
  jsFiles: number;
  htmlGzipKb: number;
  compression: string;
  rounds: Array<Awaited<ReturnType<typeof autocannon>>>;
}

const results: Result[] = [];
for (const app of APPS) {
  const cwd = join(BENCH, app.dir);
  const url = `http://localhost:${app.port}/`;
  console.log(`\n── ${app.name}`);

  for (const d of app.clean) rmSync(join(cwd, d), { recursive: true, force: true });
  let t = performance.now();
  await run(app.build, cwd);
  const buildMs = performance.now() - t;
  console.log(`  build        ${(buildMs / 1000).toFixed(2)} s`);

  t = performance.now();
  const log = openSync(join(LOGS, `${app.dir.split("/").pop()}.log`), "w");
  const server = Bun.spawn(app.start, { cwd, env: env(app.port), stdout: log, stderr: log });
  try {
    await waitFor200(url);
    const coldStartMs = performance.now() - t;
    console.log(`  cold start   ${coldStartMs.toFixed(0)} ms`);

    const html = await (await fetch(url)).text();
    const loadEncoding =
      (await fetch(url, { headers: { "Accept-Encoding": ACCEPT_ENCODING }, decompress: false })).headers.get(
        "content-encoding",
      ) ?? "none";
    if (!html.includes("Product 100")) throw new Error(`${app.name}: / did not render the workload`);

    const weight = JSON.parse(await run(["node", "page-weight.mjs", url], BENCH));
    if (!weight.hydrated) throw new Error(`${app.name}: page did not hydrate`);
    console.log(`  first-load JS ${(weight.js.gzip / 1024).toFixed(1)} KB gz in ${weight.js.count} files`);

    await autocannon(url, WARMUP);
    const rounds = [];
    for (let i = 0; i < ROUNDS; i++) {
      const r = await autocannon(url, DURATION);
      if (r.errors > 0) throw new Error(`${app.name}: ${r.errors} errors/non-2xx in round ${i + 1}`);
      rounds.push(r);
      console.log(`  round ${i + 1}      ${r.rps.toFixed(0)} req/s  p50 ${r.p50} ms  p99 ${r.p99} ms`);
    }
    const rssMb = (await processTree(server.pid)).reduce((kb, [, rss]) => kb + rss, 0) / 1024;

    results.push({
      name: app.name,
      buildSeconds: +(buildMs / 1000).toFixed(2),
      coldStartMs: Math.round(coldStartMs),
      rps: Math.round(median(rounds.map((r) => r.rps))),
      p50Ms: median(rounds.map((r) => r.p50)),
      p99Ms: median(rounds.map((r) => r.p99)),
      rssMbAfterLoad: Math.round(rssMb),
      jsGzipKb: +(weight.js.gzip / 1024).toFixed(1),
      jsRawKb: +(weight.js.raw / 1024).toFixed(1),
      jsWireKb: +(weight.js.wire / 1024).toFixed(1),
      jsFiles: weight.js.count,
      htmlGzipKb: +(weight.html.gzip / 1024).toFixed(1),
      compression: loadEncoding,
      rounds,
    });
  } finally {
    await killTree(server.pid);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
const nodeVersion = (await run(["node", "--version"], BENCH)).trim();
const pkgVersion = (dir: string, pkg: string) =>
  JSON.parse(readFileSync(join(BENCH, dir, "node_modules", pkg, "package.json"), "utf8")).version;
const machine = {
  date: new Date().toISOString(),
  cpu: cpus()[0]?.model,
  cores: availableParallelism(),
  memoryGb: Math.round(totalmem() / 2 ** 30),
  os: `${process.platform} ${(await run(["uname", "-r"], BENCH)).trim()}`,
  bun: Bun.version,
  node: nodeVersion,
  versions: {
    bractjs: JSON.parse(readFileSync(join(BENCH, "../packages/core/package.json"), "utf8")).version,
    reactRouter: pkgVersion("apps/react-router", "react-router"),
    next: pkgVersion("apps/next", "next"),
    // React Router 8 requires React >= 19.2.7; the BractJS workspace pins 19.2.6.
    react: {
      bractjs: pkgVersion("apps/bractjs", "react"),
      reactRouter: pkgVersion("apps/react-router", "react"),
      next: pkgVersion("apps/next", "react"),
    },
  },
  load: {
    connections: CONNECTIONS,
    durationSeconds: DURATION,
    rounds: ROUNDS,
    warmupSeconds: WARMUP,
    ceilingRps,
  },
};

mkdirSync(join(BENCH, "results"), { recursive: true });
const file = join(BENCH, "results", `${machine.date.slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify({ machine, results }, null, 2) + "\n");

console.log(`\n| | ${results.map((r) => r.name).join(" | ")} |`);
console.log(`|---|${results.map(() => "---:").join("|")}|`);
const row = (label: string, f: (r: Result) => string) =>
  console.log(`| ${label} | ${results.map(f).join(" | ")} |`);
row("Requests/s (`/`, median)", (r) => r.rps.toLocaleString("en-US"));
row("Latency p50 / p99", (r) => `${r.p50Ms} / ${r.p99Ms} ms`);
row("First-load JS (gzip)", (r) => `${r.jsGzipKb} KB (${r.jsFiles} files)`);
row("First-load JS over the wire", (r) => `${r.jsWireKb} KB`);
row("HTML (gzip)", (r) => `${r.htmlGzipKb} KB`);
row("Server memory after load", (r) => `${r.rssMbAfterLoad} MB`);
row("Cold start → first 200", (r) => `${r.coldStartMs} ms`);
row("Clean production build", (r) => `${r.buildSeconds} s`);
row("Response compression", (r) => r.compression);
console.log(`\nLoad-generator ceiling: ${ceilingRps.toLocaleString("en-US")} req/s. Wrote ${file}`);
