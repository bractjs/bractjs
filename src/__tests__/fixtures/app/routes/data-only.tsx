// Selective SSR: `ssr: "data-only"` — loaders DO run during document SSR (the
// data ships in the bootstrap payload), but the component renders only on the
// client; the Fallback SSRs in its place.
export const ssr = "data-only";

export function loader() {
  return { payload: "DATA-ONLY-LOADER-DATA" };
}

export function Fallback() {
  return <p>data-only fallback</p>;
}

export default function DataOnlyPage() {
  return <p>data-only component</p>;
}
