import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";

// `bractjs doctor`: diagnose the common setup problems before they surface as
// confusing runtime errors. Each check is a function returning one result, so
// tests can call them alone with controlled inputs.

/** The oldest Bun the framework is tested on (CI's matrix floor). */
export const MIN_BUN = "1.4.2";

export type CheckStatus = "ok" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about a warn/fail. */
  fix?: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export function checkBunVersion(version: string = Bun.version, min: string = MIN_BUN): CheckResult {
  const name = "Bun version";
  if (compareVersions(version, min) >= 0) return { name, status: "ok", detail: `Bun ${version}` };
  return {
    name,
    status: "fail",
    detail: `Bun ${version} is older than ${min}, the oldest version BractJS is tested on`,
    fix: "bun upgrade",
  };
}

export function checkAppLayout(appDir: string, cwd: string = process.cwd()): CheckResult {
  const name = "App directory";
  const abs = resolve(cwd, appDir);
  if (!existsSync(abs)) {
    return {
      name,
      status: "fail",
      detail: `${appDir} doesn't exist`,
      fix: "Run doctor from the app root, or set `appDir` in bractjs.config.ts",
    };
  }
  const missing = [
    existsSync(resolve(abs, "root.tsx")) || existsSync(resolve(abs, "root.ts")) ? null : "root.tsx",
    existsSync(resolve(abs, "routes")) ? null : "routes/",
  ].filter(Boolean);
  if (missing.length) {
    return {
      name,
      status: "fail",
      detail: `${appDir} has no ${missing.join(" or ")}`,
      fix: "See `bractjs new` for the expected layout",
    };
  }
  return { name, status: "ok", detail: `${appDir} with root.tsx and routes/` };
}

function packageJsonFrom(spec: string, fromDir: string): { path: string; version: string } | null {
  try {
    const path = realpathSync(Bun.resolveSync(`${spec}/package.json`, fromDir));
    const version = (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;
    return { path, version };
  } catch {
    return null;
  }
}

/**
 * Two copies of React (one for the app, one for the framework) make hydration
 * fail with "Invalid hook call" — usually a stale lockfile or a mismatched
 * version. Resolve react as the app and as the framework see it, and compare.
 */
export function checkReactCopies(cwd: string = process.cwd()): CheckResult {
  const name = "React";
  const app = packageJsonFrom("react", cwd);
  const appDom = packageJsonFrom("react-dom", cwd);
  if (!app || !appDom) {
    return {
      name,
      status: "fail",
      detail: "react / react-dom aren't installed",
      fix: "bun add react react-dom",
    };
  }
  const framework = packageJsonFrom("@bractjs/bractjs", cwd);
  const fwReact = framework ? packageJsonFrom("react", dirname(framework.path)) : null;
  if (fwReact && fwReact.path !== app.path) {
    return {
      name,
      status: "fail",
      detail: `two copies of React: the app's ${app.version} (${app.path}) and the framework's ${fwReact.version} (${fwReact.path})`,
      fix: "Dedupe react: reinstall (`rm -rf node_modules && bun install`), or pin one version with overrides",
    };
  }
  if (app.version !== appDom.version) {
    return {
      name,
      status: "fail",
      detail: `react ${app.version} and react-dom ${appDom.version} differ`,
      fix: "Install the same version of both",
    };
  }
  return { name, status: "ok", detail: `one copy, react and react-dom ${app.version}` };
}

export async function checkConfig(load: () => Promise<unknown>): Promise<CheckResult> {
  const name = "bractjs.config.ts";
  try {
    await load();
    return {
      name,
      status: "ok",
      detail: existsSync("bractjs.config.ts") ? "valid" : "none (defaults apply)",
    };
  } catch (err) {
    return { name, status: "fail", detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkGeneratedTypes(appDir: string): Promise<CheckResult> {
  const name = "Typed routes";
  const { explainStalenessForApp } = await import("../codegen/route-codegen.ts");
  try {
    const reason = await explainStalenessForApp(appDir);
    if (!reason) return { name, status: "ok", detail: "route-types.gen.ts matches the routes" };
    return {
      name,
      status: "warn",
      detail: reason,
      fix: "bractjs codegen (bractjs dev does it automatically)",
    };
  } catch (err) {
    return {
      name,
      status: "warn",
      detail: err instanceof Error ? err.message : String(err),
      fix: "bractjs codegen",
    };
  }
}

export async function checkEnv(appDir: string): Promise<CheckResult> {
  const name = "Environment";
  if (!existsSync(resolve(process.cwd(), appDir, "env.ts"))) {
    return { name, status: "ok", detail: "no app/env.ts (optional: see defineEnv)" };
  }
  const { loadEnvModule } = await import("../config/server-entry.ts");
  try {
    await loadEnvModule(appDir);
    return { name, status: "ok", detail: "app/env.ts validates" };
  } catch (err) {
    return { name, status: "fail", detail: err instanceof Error ? err.message : String(err) };
  }
}

export function checkMdx(appDir: string, cwd: string = process.cwd()): CheckResult {
  const name = "MDX";
  const routes = resolve(cwd, appDir, "routes");
  const count = existsSync(routes) ? [...new Bun.Glob("**/*.mdx").scanSync(routes)].length : 0;
  if (count === 0) return { name, status: "ok", detail: "no .mdx routes" };
  if (packageJsonFrom("@mdx-js/mdx", cwd))
    return { name, status: "ok", detail: `${count} .mdx route${count === 1 ? "" : "s"}, compiler installed` };
  return {
    name,
    status: "fail",
    detail: `${count} .mdx route${count === 1 ? "" : "s"}, but @mdx-js/mdx isn't installed`,
    fix: "bun add -d @mdx-js/mdx",
  };
}

/** Is something accepting connections on `port`? (Connecting is reliable where a trial bind isn't.) */
function portInUse(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ port, host });
    const finish = (inUse: boolean) => {
      socket.destroy();
      done(inUse);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function checkPort(port: number, host = "127.0.0.1"): Promise<CheckResult> {
  const name = "Port";
  if (!(await portInUse(port, host))) return { name, status: "ok", detail: `${port} is free` };
  return {
    name,
    status: "warn",
    detail: `${port} is in use`,
    fix: `Stop what's listening (lsof -i :${port}), or pick another with --port / PORT`,
  };
}

const ICON: Record<CheckStatus, string> = { ok: "✓", warn: "!", fail: "✗" };

export function formatDoctor(results: CheckResult[]): string {
  const width = Math.max(...results.map((r) => r.name.length));
  const lines = results.map((r) => {
    const head = `  ${ICON[r.status]} ${r.name.padEnd(width)}  ${r.detail.split("\n").join("\n    ")}`;
    return r.fix && r.status !== "ok" ? `${head}\n    → ${r.fix}` : head;
  });
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const summary =
    failed === 0 && warned === 0
      ? "Everything looks good."
      : `${failed} problem${failed === 1 ? "" : "s"}, ${warned} warning${warned === 1 ? "" : "s"}.`;
  return ["[bractjs] doctor", ...lines, "", summary].join("\n");
}
