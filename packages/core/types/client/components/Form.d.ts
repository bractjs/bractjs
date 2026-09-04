import { type FormHTMLAttributes, type ReactNode } from "react";
type FormMethod = "post" | "put" | "delete";
interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "onSubmit"> {
    method?: FormMethod;
    action?: string;
    /**
     * Convenience: renders `<input type="hidden" name="intent" value={intent}>`
     * as the first child, so a single route action can dispatch on it (pairs with
     * `defineActions()`). Carried on no-JS POSTs too.
     */
    intent?: string;
    children: ReactNode;
}
export declare function Form({ method, action, intent, children, ...rest }: FormProps): import("react").JSX.Element;
export {};
