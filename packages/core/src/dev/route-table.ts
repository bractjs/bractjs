export interface RouteTableRow {
  pattern: string;
  file: string;
  hasLoader: boolean;
  hasAction: boolean;
}

/**
 * Render a compact route inventory for the dev server boot log, so a developer
 * can see at a glance what routes the app matched (and which have data/mutation
 * handlers). Pure string formatting — no I/O.
 */
export function formatRouteTable(rows: RouteTableRow[]): string {
  if (rows.length === 0) return "[bractjs] no routes found under routes/";
  const sorted = [...rows].sort((a, b) => a.pattern.localeCompare(b.pattern));
  const patternWidth = Math.max(7, ...sorted.map((r) => r.pattern.length));
  const lines = sorted.map((r) => {
    const markers = [r.hasLoader ? "loader" : "", r.hasAction ? "action" : ""]
      .filter(Boolean)
      .join(" ");
    return `  ${r.pattern.padEnd(patternWidth)}  ${markers.padEnd(13)} ${r.file}`;
  });
  return [
    `[bractjs] ${rows.length} route${rows.length === 1 ? "" : "s"}:`,
    ...lines,
  ].join("\n");
}
