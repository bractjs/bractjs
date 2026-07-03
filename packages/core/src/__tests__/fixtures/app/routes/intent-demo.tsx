// Exercises defineActions + <Form intent> + safeValidate end to end.

import { Form } from "../../../../client/components/Form.tsx";
import { defineActions, formText, safeValidate } from "../../../../index.ts";
import type { Schema } from "../../../../server/validate.ts";

const TitleSchema: Schema<{ title: string }> = {
  safeParse(input: unknown) {
    const t =
      typeof (input as { title?: unknown })?.title === "string"
        ? (input as { title: string }).title.trim()
        : "";
    return t
      ? { success: true, data: { title: t } }
      : { success: false, error: { issues: [{ path: ["title"], message: "Title required" }] } };
  },
};

let count = 0;

export function loader() {
  return { count };
}

export const action = defineActions({
  add: async ({ formData }) => {
    const r = await safeValidate(TitleSchema, formData);
    if (!r.ok) return { error: r.firstError };
    count++;
    return { ok: true, title: r.data.title, count };
  },
  remove: ({ formData }) => {
    formText(formData, "id"); // exercise the helper
    if (count > 0) count--;
    return { ok: true, count };
  },
});

export default function IntentDemo() {
  return (
    <main>
      <Form intent="add">
        <input name="title" />
        <button type="submit">Add</button>
      </Form>
    </main>
  );
}
