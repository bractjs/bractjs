import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { csrfForbiddenResponse, isAllowedMutation } from "../server/csrf.ts";
import { mapChunkPosition } from "./source-map.ts";
import { parseStack } from "./stack.ts";

// Dev-only endpoints behind the error overlay (dev/error-overlay.ts):
//   POST /_bractjs/stack  { stack }               → frames with code excerpts
//   POST /_bractjs/open   { file, line, column }  → open the file in an editor
//
// SECURITY(high): both are mounted only in the dev runtime (serve.ts), and
// both require the same-origin mutation gate: a cross-site page can POST to
// localhost, and without the gate it could read source excerpts or make the
// developer's editor open files. Paths are confined to the project root.

export interface OverlayEndpointOptions {
  /** The project root (cwd): nothing outside it is read or opened. */
  root: string;
  /** The dev client build directory (`build/client`), for mapping browser frames. */
  clientOutDir: string;
}

export interface OverlayFrame {
  fn?: string;
  /** Path relative to the project root. */
  file: string;
  line: number;
  column: number;
  /** In the app (not node_modules or the framework). */
  app: boolean;
  /** Up to 3 lines either side of `line`. */
  excerpt: Array<{ line: number; text: string }>;
}

const MAX_BODY = 64 * 1024;
const MAX_FRAMES = 20;

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Resolve symlinks when the file exists, so `..`-free symlinks can't escape the root. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function excerptOf(source: string, line: number): Array<{ line: number; text: string }> {
  const lines = source.split("\n");
  const from = Math.max(1, line - 3);
  const to = Math.min(lines.length, line + 3);
  const out: Array<{ line: number; text: string }> = [];
  for (let n = from; n <= to; n++) out.push({ line: n, text: (lines[n - 1] ?? "").slice(0, 300) });
  return out;
}

/**
 * The line of `original` holding the same code as line `line` of `rewritten`
 * (compared trimmed), nearest to `line` when it occurs more than once; null
 * when it doesn't occur or is too generic to place (blank, a lone brace).
 */
export function relocate(rewritten: string, original: string, line: number): number | null {
  const target = rewritten.split("\n")[line - 1]?.trim();
  if (!target || target.length < 4) return null;
  let best: number | null = null;
  original.split("\n").forEach((text, i) => {
    if (text.trim() !== target) return;
    if (best === null || Math.abs(i + 1 - line) < Math.abs(best - line)) best = i + 1;
  });
  return best;
}

/** A browser frame URL (`http://host/build/client/x.js`) → the built file on disk. */
function chunkPathFor(url: string, clientOutDir: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith("/build/client/")) return null;
  const path = resolve(clientOutDir, decodeURIComponent(pathname.slice("/build/client/".length)));
  return inside(clientOutDir, path) ? path : null;
}

export function framesForStack(stack: string, opts: OverlayEndpointOptions): OverlayFrame[] {
  const root = real(opts.root);
  const out: OverlayFrame[] = [];
  for (const frame of parseStack(stack).slice(0, MAX_FRAMES * 2)) {
    let source: string | null = null;
    let line = frame.line;
    let column = frame.column;
    let content: string | undefined;
    if (/^https?:/.test(frame.file)) {
      const chunk = chunkPathFor(frame.file, opts.clientOutDir);
      if (!chunk) continue;
      const mapped = mapChunkPosition(chunk, opts.clientOutDir, frame.line, frame.column);
      if (!mapped) continue;
      ({ source, line, column, content } = mapped);
    } else if (isAbsolute(frame.file.replace(/^file:\/\//, ""))) {
      source = frame.file.replace(/^file:\/\//, "");
    }
    if (!source) continue;
    const abs = real(source);
    if (!inside(root, abs)) continue;
    let onDisk: string | undefined;
    try {
      onDisk = readFileSync(abs, "utf8");
    } catch {
      // Gone (or never on disk): fall back to the map's embedded copy.
    }
    if (content !== undefined && onDisk !== undefined && content !== onDisk) {
      // The map points into a build-time rewrite of the file (route modules
      // are rewritten without a source map). Find the same line in the real file.
      const found = relocate(content, onDisk, line);
      if (found !== null) {
        line = found;
        content = onDisk;
      }
    }
    content ??= onDisk;
    if (content === undefined) continue;
    const rel = relative(root, abs).split(sep).join("/");
    out.push({
      fn: frame.fn,
      file: rel,
      line,
      column,
      app: !rel.includes("node_modules/") && !rel.startsWith("packages/core/"),
      excerpt: excerptOf(content, line),
    });
    if (out.length >= MAX_FRAMES) break;
  }
  return out;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function handleStackRequest(request: Request, opts: OverlayEndpointOptions): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isAllowedMutation(request)) return csrfForbiddenResponse();
  const body = await readJson(request);
  if (!body || typeof body.stack !== "string") return new Response("Bad Request", { status: 400 });
  return Response.json(
    { frames: framesForStack(body.stack, opts) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * argv to open `file` at `line`:`column` with `editor`: a command name or
 * path, optionally with flags (`EDITOR="code --wait"` is common). A value
 * that is an existing path is one command, even with spaces in it.
 */
export function editorArgs(editor: string, file: string, line: number, column: number): string[] {
  const trimmed = editor.trim();
  const [command, ...flags] = existsSync(trimmed) ? [trimmed] : trimmed.split(/\s+/);
  const name = basename(command)
    .replace(/\.(exe|cmd)$/i, "")
    .toLowerCase();
  const head = [command, ...flags];
  if (["code", "code-insiders", "cursor", "windsurf", "codium", "vscodium"].includes(name)) {
    return [...head, "-g", `${file}:${line}:${column}`];
  }
  if (["subl", "zed", "sublime_text"].includes(name)) return [...head, `${file}:${line}:${column}`];
  if (["idea", "webstorm", "phpstorm", "pycharm", "goland", "rubymine", "clion"].includes(name)) {
    return [...head, "--line", String(line), "--column", String(column), file];
  }
  if (["vim", "nvim", "vi", "emacs", "nano", "mate"].includes(name)) return [...head, `+${line}`, file];
  return [...head, file];
}

/** `BRACTJS_EDITOR`, else `VISUAL`, else `EDITOR`, else VS Code's `code`. */
export function chosenEditor(env: Record<string, string | undefined> = process.env): string {
  return env.BRACTJS_EDITOR || env.VISUAL || env.EDITOR || "code";
}

export async function handleOpenRequest(
  request: Request,
  opts: OverlayEndpointOptions,
  launch: (argv: string[]) => void = defaultLaunch,
): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isAllowedMutation(request)) return csrfForbiddenResponse();
  const body = await readJson(request);
  if (!body || typeof body.file !== "string") return new Response("Bad Request", { status: 400 });
  const line = Number(body.line ?? 1);
  const column = Number(body.column ?? 1);
  if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) {
    return new Response("Bad Request: line and column must be positive integers", { status: 400 });
  }
  const root = real(opts.root);
  const abs = real(resolve(root, body.file));
  if (!inside(root, abs) || !existsSync(abs)) return new Response("Forbidden", { status: 403 });
  launch(editorArgs(chosenEditor(), abs, line, column));
  return new Response(null, { status: 204 });
}

function defaultLaunch(argv: string[]): void {
  // No shell: argv goes to the editor verbatim.
  const child = spawn(argv[0], argv.slice(1), { stdio: "ignore", detached: true });
  child.on("error", (err) => console.warn(`[bractjs] couldn't open the editor (${argv[0]}): ${err.message}`));
  child.unref();
}
