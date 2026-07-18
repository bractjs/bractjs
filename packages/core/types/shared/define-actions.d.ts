import type { ActionArgs } from "./route-types.ts";
type IntentHandler = (args: ActionArgs) => unknown;
/**
 * Compose a single route `action` from per-intent handlers, dispatching on the
 * form's `intent` field. Pairs with `<Form intent="...">` / `<fetcher.Form
 * intent="...">`, which render the matching hidden input:
 *
 * ```ts
 * export const action = defineActions({
 *   add:    ({ formData }) => addTodo(formText(formData, "title")),
 *   delete: ({ formData }) => deleteTodo(formText(formData, "id")),
 * });
 * ```
 *
 * A missing or unknown intent returns a 400 `Response` (dev lists the known
 * intents; prod is terse). Each handler receives the full {@link ActionArgs}.
 */
export declare function defineActions<M extends Record<string, IntentHandler>>(handlers: M): (args: ActionArgs) => Promise<Awaited<ReturnType<M[keyof M]>> | Response>;
export {};
