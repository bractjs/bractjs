// RichField — the post/page body editor.
//
// RichEditor is a "use client" module: it renders null during SSR and on the
// first client render, then mounts the contentEditable + toolbar and keeps a
// hidden <input name> in sync so the surrounding <Form> submits the body. The
// admin is a JS app, so there is no no-JS fallback here (a `<noscript>` textarea
// caused a React hydration mismatch and added little value for an auth(enticated
// editor that needs JS to function).

import { RichEditor } from "./RichEditor.tsx";

export function RichField({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  return <RichEditor name={name} defaultValue={defaultValue} />;
}
