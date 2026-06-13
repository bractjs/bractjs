import path from "node:path";
import { watch } from "node:fs";

const WATCHED_EXTENSIONS = new Set([".tsx", ".ts", ".css"]);

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
}

/**
 * Watches appDir for file changes and calls onChange with the changed file path.
 * Debounces rapid changes within 50ms to avoid duplicate rebuilds.
 */
export function watchApp(
  appDir: string,
  onChange: (file: string, info: WatchChangeInfo) => void,
): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFile = "";
  let lastEvent: "rename" | "change" = "change";
  let renameSeen = false;

  watch(appDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const ext = path.extname(filename);
    if (!WATCHED_EXTENSIONS.has(ext)) return;

    pendingFile = filename;
    lastEvent = eventType === "rename" ? "rename" : "change";
    // OR-accumulate across the debounce window: a save (change) immediately
    // followed by a create (rename) must not lose the rename signal.
    if (lastEvent === "rename") renameSeen = true;

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      console.log(`✓ ${path.basename(pendingFile)} changed`);
      onChange(pendingFile, { event: lastEvent, renameSeen });
      renameSeen = false;
    }, 50);
  });
}
