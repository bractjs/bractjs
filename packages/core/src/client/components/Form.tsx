import { type FormEvent, type FormHTMLAttributes, type ReactNode, useContext, useEffect, useId } from "react";
import { fetcherStore } from "../fetcher-store.ts";
import { fetcherSubmit } from "../hooks/useFetcher.ts";
import { NavigationContext, RouterContext } from "../router.tsx";
import { normalizeSubmission, type SubmitEncType } from "../submission.ts";

// ── Types ──────────────────────────────────────────────────────────────────

type FormMethod = "get" | "post" | "put" | "patch" | "delete";

interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "onSubmit" | "encType"> {
  /**
   * `"get"` navigates to `action?<fields>` (a search form); anything else runs
   * the route action. Default `"post"` (React Router defaults to `"get"`, so a
   * ported `<Form>` without a method should say `method="get"` explicitly).
   */
  method?: FormMethod;
  action?: string;
  /**
   * Convenience: renders `<input type="hidden" name="intent" value={intent}>`
   * as the first child, so a single route action can dispatch on it (pairs with
   * `defineActions()`). Carried on no-JS POSTs too.
   */
  intent?: string;
  encType?: SubmitEncType;
  /** `false` submits through a fetcher — no navigation, no history entry (React Router). */
  navigate?: boolean;
  /** With `navigate={false}`: the fetcher key (visible in `useFetchers()`). */
  fetcherKey?: string;
  /** GET forms: replace the current history entry. */
  replace?: boolean;
  /** GET forms: history state for the new entry. */
  state?: unknown;
  /** `true` skips client-side handling: the browser submits the form natively. */
  reloadDocument?: boolean;
  /**
   * After the action, passed to routes' `shouldRevalidate` as
   * `defaultShouldRevalidate`; routes without one follow it (React Router 8).
   */
  defaultShouldRevalidate?: boolean;
  /** Accepted for React Router compatibility; no effect. */
  preventScrollReset?: boolean;
  /** Accepted for React Router compatibility; no effect. */
  relative?: "route" | "path";
  /** Animate the resulting page update with the View Transitions API (ignored where unsupported). */
  viewTransition?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Form({
  method = "post",
  action,
  intent,
  encType,
  navigate = true,
  fetcherKey,
  replace,
  state,
  reloadDocument,
  defaultShouldRevalidate,
  preventScrollReset: _preventScrollReset,
  relative: _relative,
  viewTransition,
  onSubmit,
  children,
  ...rest
}: FormProps) {
  const routerCtx = useContext(RouterContext);
  const navCtx = useContext(NavigationContext);
  const autoKey = useId();
  // A `navigate={false}` form without a fetcherKey submits through an
  // auto-keyed fetcher: drop it from useFetchers() with the form, as an
  // unkeyed useFetcher() does. (Before the early return: hooks run always.)
  useEffect(() => () => fetcherStore.remove(`__form${autoKey}`), [autoKey]);
  // The hidden intent input, rendered first so it's part of every submission
  // (JS and native). `key` keeps React happy alongside arbitrary children.
  const intentInput =
    intent !== undefined ? <input key="__bract_intent" type="hidden" name="intent" value={intent} /> : null;

  // SSR (and reloadDocument): render a plain form — the browser submits it.
  if (!routerCtx || !navCtx || reloadDocument) {
    return (
      <form method={method} action={action} encType={encType} onSubmit={onSubmit} {...rest}>
        {intentInput}
        {children}
      </form>
    );
  }

  const { location, setRoute } = routerCtx;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    onSubmit?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();

    const target = e.currentTarget;
    // The clicked button's name/value and formaction/formmethod take part, as
    // in a native submit.
    const submitter = (e.nativeEvent as SubmitEvent | undefined)?.submitter as
      HTMLButtonElement | HTMLInputElement | null | undefined;
    const formData = submitter ? new FormData(target, submitter) : new FormData(target);
    const formMethod = (submitter?.getAttribute("formmethod") as FormMethod | null) ?? method;
    // Default to the full current URL (pathname + search) so actions can read
    // the same search params their page was rendered with.
    const url = submitter?.getAttribute("formaction") ?? action ?? location.pathname + location.search;
    const n = normalizeSubmission(formData, { action: url, method: formMethod, encType });

    if (!navigate) {
      await fetcherSubmit(fetcherKey ?? `__form${autoKey}`, {
        url: n.url,
        method: n.method,
        body: n.body,
        contentType: n.contentType,
        formData: n.formData,
        defaultShouldRevalidate,
      });
      return;
    }

    if (n.method === "GET") {
      // A search form: navigate to action?<fields>, loaders re-run.
      await navCtx!.navigate(n.url, { replace, state, defaultShouldRevalidate, viewTransition });
      return;
    }

    setRoute({ actionData: null }); // clear stale action data
    // The router's submit drives useNavigation() through "submitting" →
    // "loading" → "idle", commits the action data, follows redirects safely
    // (CSRF header + same-origin guard), and revalidates loaders.
    await navCtx!.submit(n.url, {
      method: n.method,
      body: n.body,
      contentType: n.contentType,
      defaultShouldRevalidate,
      viewTransition,
    });
  }

  // Render `action` here too (the SSR branch sets it): handleSubmit
  // preventDefaults so it's never used for a native submit, but keeping it on
  // the element makes the client markup match the server's and avoids a
  // hydration mismatch for any <Form action="…"> (e.g. a logout form posting
  // to a different route).
  return (
    <form
      method={method}
      action={action}
      encType={encType}
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      {...rest}
    >
      {intentInput}
      {children}
    </form>
  );
}
