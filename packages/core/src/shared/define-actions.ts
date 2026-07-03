import { isExplicitDev } from "../server/env.ts";
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
export function defineActions<M extends Record<string, IntentHandler>>(
  handlers: M,
): (args: ActionArgs) => Promise<Awaited<ReturnType<M[keyof M]>> | Response> {
  type Out = Awaited<ReturnType<M[keyof M]>> | Response;
  const dispatch = async (args: ActionArgs): Promise<Out> => {
    const raw = args.formData.get("intent");
    const intent = typeof raw === "string" ? raw : "";
    const handler = handlers[intent];
    if (!handler) {
      const known = Object.keys(handlers);
      const message = isExplicitDev()
        ? `Unknown action intent ${JSON.stringify(intent)}. Known intents: ${known.join(", ") || "(none)"}.`
        : "Unknown action intent.";
      return Response.json({ error: message }, { status: 400 });
    }
    return (await handler(args)) as Out;
  };
  return dispatch;
}
