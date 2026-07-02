"use client";
// A dependency-free WYSIWYG editor. Because this is a "use client" module it is
// stubbed to null during SSR and only runs after hydration. It keeps a hidden
// <textarea name={name}> in sync with a contentEditable surface, so the
// surrounding <Form> submits the body like any normal field. The route also
// renders a plain <textarea> fallback for the no-JS / pre-hydration case (see
// RichEditorFallback below) — only one of them is ever in the DOM at a time.

import { useEffect, useRef, useState } from "react";

type Cmd = { label: string; title: string; run: (exec: (c: string, v?: string) => void) => void };

const COMMANDS: Cmd[] = [
  { label: "B", title: "Bold", run: (e) => e("bold") },
  { label: "I", title: "Italic", run: (e) => e("italic") },
  { label: "H2", title: "Heading", run: (e) => e("formatBlock", "<h2>") },
  { label: "H3", title: "Subheading", run: (e) => e("formatBlock", "<h3>") },
  { label: "¶", title: "Paragraph", run: (e) => e("formatBlock", "<p>") },
  { label: "“ ”", title: "Quote", run: (e) => e("formatBlock", "<blockquote>") },
  { label: "• List", title: "Bulleted list", run: (e) => e("insertUnorderedList") },
  { label: "1. List", title: "Numbered list", run: (e) => e("insertOrderedList") },
  {
    label: "Link",
    title: "Insert link",
    run: (e) => {
      const url = window.prompt("Link URL");
      if (url) e("createLink", url);
    },
  },
  { label: "Clear", title: "Remove formatting", run: (e) => e("removeFormat") },
];

export function RichEditor({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue);
  // This module is stubbed to null during SSR, so the server renders nothing
  // here (only RichField's <noscript> fallback). To avoid a hydration mismatch
  // (React #418), the first client render must also produce null; we then flip
  // `mounted` in an effect and render the real editor.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Seed the contentEditable once the editor is in the DOM (uncontrolled
  // thereafter so the caret isn't reset on every keystroke).
  useEffect(() => {
    if (mounted && editorRef.current) editorRef.current.innerHTML = defaultValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;

  const sync = () => setHtml(editorRef.current?.innerHTML ?? "");
  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };

  return (
    <div
      style={{
        border: "1px solid var(--admin-line, #dde3e8)",
        borderRadius: "10px",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: ".2rem",
          padding: ".4rem",
          borderBottom: "1px solid #eef1f4",
          background: "#f9fafb",
        }}
      >
        {COMMANDS.map((c) => (
          <button
            key={c.title}
            type="button"
            title={c.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c.run(exec)}
            style={{
              border: "1px solid #dde3e8",
              background: "#fff",
              borderRadius: "6px",
              padding: ".25rem .5rem",
              cursor: "pointer",
              fontSize: ".82rem",
              fontWeight: 600,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        role="textbox"
        aria-multiline="true"
        style={{ minHeight: "12rem", padding: ".8rem", outline: "none", lineHeight: 1.6, fontSize: "1rem" }}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}

export default RichEditor;
