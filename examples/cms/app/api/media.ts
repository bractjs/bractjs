// app/api/media.ts — multipart upload endpoint for the drag/drop dropzone.
//
// POST /api/media/upload with one or more `files` parts. Mutating + cookie-authed,
// so the typed-route CSRF gate (same-origin) applies automatically; we add the
// authorization check (media.manage) on top. Registered via root.tsx.

import { route } from "@bractjs/bractjs";
import { can, getAdmin } from "../auth.server.ts";
import { saveUpload } from "../upload.server.ts";

export const uploadMedia = route("POST", "/api/media/upload", async (input, request) => {
  const user = await getAdmin(request);
  if (!user || !can(user, "media.manage")) throw Response.json({ error: "Forbidden" }, { status: 403 });
  // The dispatcher already parsed the multipart body into `input`.
  const form = input instanceof FormData ? input : await request.formData();
  const files = form.getAll("files");
  if (files.length === 0) throw Response.json({ error: "No files" }, { status: 400 });
  let uploaded = 0;
  const errors: string[] = [];
  for (const f of files) {
    const res = await saveUpload(f, "");
    if (res.ok) uploaded += 1;
    else errors.push(res.reason);
  }
  return { uploaded, errors };
});
