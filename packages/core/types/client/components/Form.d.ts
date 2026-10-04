import { type FormEvent, type FormHTMLAttributes, type ReactNode } from "react";
import { type SubmitEncType } from "../submission.ts";
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
export declare function Form({ method, action, intent, encType, navigate, fetcherKey, replace, state, reloadDocument, defaultShouldRevalidate, preventScrollReset: _preventScrollReset, relative: _relative, viewTransition, onSubmit, children, ...rest }: FormProps): import("react").JSX.Element;
export {};
