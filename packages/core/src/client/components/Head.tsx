// React Router root-document components. BractJS renders route meta and links
// into <head> itself (React 19 hoists them from anywhere in the tree), so a
// ported root.tsx that still renders these gets no duplicates: both are no-ops.

/** React Router `<Meta />`. No-op: BractJS renders route `meta()` automatically. */
export function Meta(): null {
  return null;
}

/** React Router `<Links />`. No-op: BractJS renders route `links()` and CSS automatically. */
export function Links(): null {
  return null;
}

/** React Router `<PrefetchPageLinks>`. No-op: use `<Link prefetch="intent">` instead. */
export function PrefetchPageLinks(_props: { page: string }): null {
  return null;
}
