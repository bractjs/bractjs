import { resolveAction } from "./action-registry.ts";
import { json } from "./response.ts";

export async function handleActionRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/_action")) return null;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const id = url.searchParams.get("id");
  if (!id) return new Response("Bad Request: missing action id", { status: 400 });

  const fn = resolveAction(id);
  if (!fn) return new Response("Not Found", { status: 404 });

  let args: unknown[];
  try {
    const ct = request.headers.get("Content-Type") ?? "";
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      args = [await request.formData()];
    } else {
      const text = await request.text();
      args = text ? JSON.parse(text) as unknown[] : [];
    }
  } catch {
    return new Response("Bad Request: invalid body", { status: 400 });
  }

  try {
    const result = await fn(...args);
    return json(result ?? null);
  } catch (err) {
    console.error("[bractjs] server action error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
