import { basename } from "node:path";

// Files embedded in a compiled binary by `bun build --compile --asset <dir>`
// (`bractjs compile` embeds `<buildDir>/client` and `public/`). Bun exposes
// them as `Bun.embeddedFiles`, named by their path under the embedded
// directory's PARENT: `--asset build/client` yields `client/app/root.abc.css`,
// `--asset public` yields `public/favicon.ico`. So a file is looked up by its
// directory's last segment plus its path inside it — the binary serves its
// client build and public files with neither directory on disk.

let index: Map<string, Blob> | null = null;

function embeddedIndex(): Map<string, Blob> {
  if (index) return index;
  index = new Map();
  const files = (globalThis as { Bun?: { embeddedFiles?: ReadonlyArray<Blob & { name?: string }> } }).Bun
    ?.embeddedFiles;
  for (const file of files ?? []) {
    if (file.name) index.set(file.name.split("\\").join("/"), file);
  }
  return index;
}

/** The embedded copy of `rel` inside directory `dir` (e.g. `build/client`, `app/root.abc.css`), if any. */
export function embeddedFile(dir: string, rel: string): Blob | undefined {
  const files = embeddedIndex();
  if (files.size === 0) return undefined;
  return files.get(`${basename(dir)}/${rel.split("\\").join("/")}`);
}

/** Test seam: forget the cached index. */
export function _resetEmbeddedIndex(files?: Map<string, Blob>): void {
  index = files ?? null;
}
