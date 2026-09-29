import { type SubmitOptions, type SubmitTarget } from "../submission.ts";
export type SubmitFunction = (target: SubmitTarget, options?: SubmitOptions) => Promise<void>;
/**
 * React Router's `useSubmit()`: submit a form, FormData, URLSearchParams,
 * plain object or (with `encType: "application/json"`) any JSON value —
 * imperatively, with the same semantics as `<Form>`.
 *
 * ```tsx
 * const submit = useSubmit();
 * <select onChange={(e) => submit(e.currentTarget.form)} />
 * submit({ intent: "delete", id }, { method: "post" });
 * submit({ q }, { method: "get", replace: true });           // navigates to ?q=…
 * submit(todo, { method: "post", encType: "application/json" }); // action reads request.json()
 * submit(data, { method: "post", navigate: false, fetcherKey: "save" });
 * ```
 *
 * A `get` submission navigates to `action?<fields>`; any other method runs the
 * route action (driving `useNavigation()`), follows its redirect, and
 * revalidates. `navigate: false` routes it through a fetcher instead (visible
 * in `useFetchers()` under `fetcherKey`). SSR-safe: a no-op on the server.
 */
export declare function useSubmit(): SubmitFunction;
