import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Map a position in a dev client chunk back to its source, through the inline
// source map the dev rebuilder emits (`sourcemap: "inline"`). Dev overlay only.

interface RawMap {
  sources: string[];
  sourcesContent?: Array<string | null>;
  mappings: string;
}

export interface OriginalPosition {
  /** Absolute path of the original source. */
  source: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** The source text, when the map embeds it. */
  content?: string;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

/** Decode one VLQ-encoded segment into its numbers. */
function decodeSegment(segment: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64_INDEX.get(ch);
    if (digit === undefined) return out;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    out.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return out;
}

/** The inline source map of a built JS file, or null. */
export function readInlineSourceMap(code: string): RawMap | null {
  const m =
    /\/\/# sourceMappingURL=data:application\/json(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)\s*$/.exec(
      code,
    );
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as RawMap;
  } catch {
    return null;
  }
}

/**
 * The original position of generated `line`:`column` (1-based) — the last
 * mapping at or before the column on that line. Null when unmapped.
 */
export function originalPositionFor(
  map: RawMap,
  line: number,
  column: number,
): { sourceIndex: number; line: number; column: number } | null {
  const lines = map.mappings.split(";");
  if (line < 1 || line > lines.length) return null;
  // Source/line/column fields are deltas across the whole mappings string, so
  // walk every earlier line to accumulate them.
  let sourceIndex = 0;
  let origLine = 0;
  let origColumn = 0;
  let best: { sourceIndex: number; line: number; column: number } | null = null;
  for (let l = 0; l < line; l++) {
    let genColumn = 0;
    for (const seg of lines[l].split(",")) {
      if (!seg) continue;
      const f = decodeSegment(seg);
      genColumn += f[0] ?? 0;
      if (f.length < 4) continue;
      sourceIndex += f[1];
      origLine += f[2];
      origColumn += f[3];
      if (l === line - 1 && genColumn <= column - 1) {
        best = { sourceIndex, line: origLine + 1, column: origColumn + 1 };
      }
    }
  }
  return best;
}

/**
 * Map `line`:`column` of the built file at `chunkPath` to its source. Bun
 * writes `sources` relative to the build's output root (`outRoot`); a path
 * relative to the chunk itself is tried too.
 */
export function mapChunkPosition(
  chunkPath: string,
  outRoot: string,
  line: number,
  column: number,
): OriginalPosition | null {
  let code: string;
  try {
    code = readFileSync(chunkPath, "utf8");
  } catch {
    return null;
  }
  const map = readInlineSourceMap(code);
  if (!map) return null;
  const pos = originalPositionFor(map, line, column);
  if (!pos) return null;
  const rel = map.sources[pos.sourceIndex];
  if (!rel) return null;
  const candidates = [resolve(outRoot, rel), resolve(dirname(chunkPath), rel)];
  const source = candidates.find((p) => existsSync(p)) ?? candidates[0];
  return {
    source,
    line: pos.line,
    column: pos.column,
    content: map.sourcesContent?.[pos.sourceIndex] ?? undefined,
  };
}
