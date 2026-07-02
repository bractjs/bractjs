// app/validation.ts
//
// BractJS's `validate()` helper accepts *any* object with a `.safeParse()`
// (Zod / Valibot style) or `.parse()` method — it is not tied to a specific
// library. To keep this example dependency-free, we hand-roll a tiny schema
// that speaks the same `.safeParse()` shape. In a real app you'd drop in Zod:
//
//   import { z } from "zod";
//   export const TodoTitleSchema = z.object({ title: z.string().min(1).max(120) });

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Array<{ path: string[]; message: string }> } };

/** Minimal Zod/Valibot-style schema interface — the shape `validate()` accepts. */
export interface SchemaLike<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

export type TodoInput = { title: string };

const MAX_TITLE = 120;

export const TodoTitleSchema: SchemaLike<TodoInput> = {
  safeParse(input: unknown): SafeParseResult<TodoInput> {
    const issues: Array<{ path: string[]; message: string }> = [];
    const raw = (input as { title?: unknown })?.title;
    const title = typeof raw === "string" ? raw.trim() : "";

    if (title.length === 0) {
      issues.push({ path: ["title"], message: "Please add a task title." });
    } else if (title.length > MAX_TITLE) {
      issues.push({ path: ["title"], message: `Task title is too long (max ${MAX_TITLE} chars).` });
    }

    if (issues.length > 0) return { success: false, error: { issues } };
    return { success: true, data: { title } };
  },
};

// Search-param schema for the board's `?filter=` (the route exports this as
// `searchSchema`). Deliberately lenient — junk values fall back to "all"
// instead of 400ing, the equivalent of Zod's
//   z.object({ filter: z.enum(["all","active","completed"]).catch("all") })
export type BoardSearch = { filter: "all" | "active" | "completed" };

export const BoardSearchSchema: SchemaLike<BoardSearch> = {
  safeParse(input: unknown): SafeParseResult<BoardSearch> {
    const raw = (input as { filter?: unknown })?.filter;
    const filter = raw === "active" || raw === "completed" ? raw : "all";
    return { success: true, data: { filter } };
  },
};
