// Server-rendered media pickers used inside post/page <Form>s. A radio strip
// for the single featured image, and a checkbox grid for the gallery. Repeated
// checkbox keys arrive as an array via formData.getAll(name).

import type { Media } from "../models/media.server.ts";

export function FeaturedImagePicker({
  media,
  selectedId,
  name = "featuredMediaId",
}: {
  media: Media[];
  selectedId: string | null;
  name?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: ".5rem",
        overflowX: "auto",
        padding: ".25rem",
        border: "1px solid var(--admin-line)",
        borderRadius: "10px",
        background: "#fff",
      }}
    >
      <label style={thumbLabel(!selectedId)}>
        <input type="radio" name={name} value="" defaultChecked={!selectedId} style={{ display: "none" }} />
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: "72px",
            height: "72px",
            color: "var(--muted)",
            fontSize: ".75rem",
          }}
        >
          None
        </span>
      </label>
      {media.map((m) => (
        <label key={m.id} style={thumbLabel(selectedId === m.id)} title={m.originalName}>
          <input
            type="radio"
            name={name}
            value={m.id}
            defaultChecked={selectedId === m.id}
            style={{ display: "none" }}
          />
          <img
            src={m.url}
            alt={m.alt}
            style={{
              width: "72px",
              height: "72px",
              objectFit: "cover",
              borderRadius: "6px",
              display: "block",
            }}
          />
        </label>
      ))}
    </div>
  );
}

export function GalleryPicker({
  media,
  selectedIds,
  name = "mediaIds",
}: {
  media: Media[];
  selectedIds: string[];
  name?: string;
}) {
  const set = new Set(selectedIds);
  if (media.length === 0)
    return <p style={{ color: "var(--muted)", margin: 0, fontSize: ".85rem" }}>No media to attach yet.</p>;
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: ".4rem" }}
    >
      {media.map((m) => (
        <label key={m.id} style={thumbLabel(set.has(m.id))} title={m.originalName}>
          <input
            type="checkbox"
            name={name}
            value={m.id}
            defaultChecked={set.has(m.id)}
            style={{ display: "none" }}
          />
          <img
            src={m.url}
            alt={m.alt}
            style={{
              width: "100%",
              aspectRatio: "1/1",
              objectFit: "cover",
              borderRadius: "6px",
              display: "block",
            }}
          />
        </label>
      ))}
    </div>
  );
}

function thumbLabel(active: boolean) {
  return {
    cursor: "pointer",
    borderRadius: "8px",
    padding: "2px",
    flex: "0 0 auto",
    outline: active ? "3px solid var(--accent)" : "3px solid transparent",
  } as const;
}
