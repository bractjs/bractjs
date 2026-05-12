import path from "node:path";
import { watch } from "node:fs";

const WATCHED_EXTENSIONS = new Set([".tsx", ".ts", ".css"]);

/**
 * Watches appDir for file changes and calls onChange with the changed file path.
 * Debounces rapid changes within 50ms to avoid duplicate rebuilds.
 */
export function watchApp(appDir: string, onChange: (file: string) => void): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFile = "";

  watch(appDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;

    const ext = path.extname(filename);
    if (!WATCHED_EXTENSIONS.has(ext)) return;

    pendingFile = filename;

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      console.log(`✓ ${path.basename(pendingFile)} changed`);
      onChange(pendingFile);
    }, 50);
  });
}
