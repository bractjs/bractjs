import { watch } from "node:fs";
import path from "node:path";

const WATCHED_EXTENSIONS = new Set([".tsx", ".ts", ".css", ".mdx"]);

/** Extra info about a debounced change burst. */
export interface WatchChangeInfo {
  /** The last file event type seen in the burst. */
  event: "rename" | "change";
  /**
   * True when ANY event in the burst was a "rename" (add/remove/rename) — not
   * just the last one. `fs.watch` collapses bursts, so this is OR-accumulated
   * across the debounce window; the codegen trigger keys on it.
   */
  renameSeen: boolean;
  /**
   * Every watched file the burst touched, in first-seen order (the reported
   * `file` is the last one). A save that touches `x.server.ts` and a route in
   * the same 50ms window must not lose the server-side change.
   */
  files: string[];
}

/** Handle returned by {@link watchApp} so callers can release the watcher. */
export interface AppWatcher {
  /** Stop watching: closes the FSWatcher and cancels any pending debounce. */
  close(): void;
}

/**
 * Watches appDir for file changes and calls onChange with the changed file path.
 * Debounces rapid changes within 50ms to avoid duplicate rebuilds.
 *
 * A rejected/throwing onChange is logged, never left as an unhandled
 * rejection — a broken rebuild must not kill the dev process.
 */
export function watchApp(
  appDir: string,
  onChange: (file: string, info: WatchChangeInfo) => void | Promise<void>,
): AppWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFile = "";
  const pendingFiles = new Set<string>();
  let lastEvent: "rename" | "change" = "change";
  let renameSeen = false;
  let closed = false;

  const watcher = watch(appDir, { recursive: true }, (eventType, filename) => {
    if (closed || !filename) return;

    const ext = path.extname(filename);
    if (!WATCHED_EXTENSIONS.has(ext)) return;
    // Hidden files are editor/tool temporaries (sed -i's `.!1234!x.tsx`, vim's
    // `.x.tsx.swp`), never app modules. They arrive in the same burst as the
    // real file, and since a burst reports its LAST file, one would otherwise
    // be reported in place of the file actually edited.
    if (path.basename(filename).startsWith(".")) return;

    pendingFile = filename;
    pendingFiles.add(filename);
    lastEvent = eventType === "rename" ? "rename" : "change";
    // OR-accumulate across the debounce window: a save (change) immediately
    // followed by a create (rename) must not lose the rename signal.
    if (lastEvent === "rename") renameSeen = true;

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (closed) return;
      const files = [...pendingFiles];
      pendingFiles.clear();
      console.log(
        files.length > 1 ? `✓ ${files.length} files changed` : `✓ ${path.basename(pendingFile)} changed`,
      );
      const info: WatchChangeInfo = { event: lastEvent, renameSeen, files };
      renameSeen = false;
      try {
        const result = onChange(pendingFile, info);
        if (result instanceof Promise) {
          result.catch((err) => console.error("[bractjs] watch handler error:", err));
        }
      } catch (err) {
        console.error("[bractjs] watch handler error:", err);
      }
    }, 50);
  });

  return {
    close() {
      if (closed) return;
      closed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      watcher.close();
    },
  };
}
