"use client";
// Admin-wide drag/drop upload. Drop one or many images ANYWHERE in the admin and
// they POST to /api/media/upload (multipart), then we land on the media library.
// "use client" → SSR-stubbed, so it renders null until hydrated (no hydration
// mismatch). The overlay is pointer-events:none so the drop still reaches window.

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "../use-hydrated.ts";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function DropZone() {
  const hydrated = useHydrated();
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const depth = useRef(0);

  useEffect(() => {
    if (!hydrated) return;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      setStatus(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      try {
        const res = await fetch("/api/media/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(String(res.status));
        window.location.href = "/admin/media"; // reload/navigate to show the new files
      } catch {
        setStatus("Upload failed — check the file types and try again.");
        setTimeout(() => setStatus(null), 4000);
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [hydrated]);

  if (!hydrated || (!active && !status)) return null;
  return (
    <div className="dropzone-overlay">
      <div className="dropzone-card">{status ?? "Drop image(s) anywhere to upload"}</div>
    </div>
  );
}
