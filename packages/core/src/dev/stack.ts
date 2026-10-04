/** One frame of an error stack. */
export interface StackFrame {
  /** Function name, when the engine gives one. */
  fn?: string;
  /** A file path or URL, without any `?query`. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

// V8 / Bun:      "    at loader (/app/routes/x.tsx:5:9)"  or  "    at /app/x.ts:5:9"
// Firefox/Safari: "loader@http://localhost:3000/build/client/x.js:5:9"
const V8 = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/** Parse an `Error.stack` string into frames (unparseable lines are skipped). */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    const m = V8.exec(line) ?? GECKO.exec(line);
    if (!m) continue;
    const [, fn, rawFile, l, c] = m;
    // `async loader` / `new Foo` → the bare name.
    const name = fn?.replace(/^(?:async|new)\s+/, "").trim() || undefined;
    // Dev cache-busting (`?v=3`) and HMR (`?file=…&t=…`) queries aren't part of the file.
    const file = rawFile.startsWith("http") ? rawFile : rawFile.replace(/\?.*$/, "");
    frames.push({ fn: name, file, line: Number(l), column: Number(c) });
  }
  return frames;
}
