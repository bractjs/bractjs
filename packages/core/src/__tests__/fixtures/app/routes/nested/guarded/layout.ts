// Fixture: a guard-only layout (no component). It must stay transparent: its
// loader runs, but nothing renders at its level.
export function loader() {
  return { guard: "passed" };
}
