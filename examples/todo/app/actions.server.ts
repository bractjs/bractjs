"use server";
// app/actions.server.ts — server actions. The "use server" first line makes every
// export callable from the browser: the client bundle gets a fetch proxy to
// /_action, and the real function runs here on the server.
//
// renameTask is written for React 19's useActionState: it receives the
// previous state and the submitted form, and returns the next state. After it
// resolves, BractJS re-runs the page's loaders, so the new title shows up
// without any manual refetch.

import { safeValidate } from "@bractjs/bractjs";
import { renameTodo } from "./todos.server.ts";
import type { ActionResult } from "./ui.tsx";
import { type TodoInput, TodoTitleSchema } from "./validation.ts";

export async function renameTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Missing task id." };
  const result = await safeValidate<TodoInput>(TodoTitleSchema, formData);
  if (!result.ok) return { error: result.firstError };
  if (!renameTodo(id, result.data.title)) return { error: "That task does not exist." };
  return { ok: "Task renamed" };
}
