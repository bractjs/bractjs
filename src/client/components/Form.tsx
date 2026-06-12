import { useContext, type FormEvent, type ReactNode, type FormHTMLAttributes } from "react";
import { RouterContext, NavigationContext } from "../router.tsx";

// ── Types ──────────────────────────────────────────────────────────────────

type FormMethod = "post" | "put" | "delete";

interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "onSubmit"> {
  method?: FormMethod;
  action?: string;
  children: ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Form({ method = "post", action, children, ...rest }: FormProps) {
  const routerCtx = useContext(RouterContext);
  const navCtx = useContext(NavigationContext);

  // SSR: render a plain form — no JS submit handler needed
  if (!routerCtx || !navCtx) {
    return (
      <form method={method} action={action} {...rest}>
        {children}
      </form>
    );
  }

  const { location, setRoute } = routerCtx;
  const { submit } = navCtx;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRoute({ actionData: null }); // clear stale action data

    const target = e.currentTarget;
    // Default to the full current URL (pathname + search) so actions can read
    // the same search params their page was rendered with.
    const url = action ?? location.pathname + location.search;

    // The router's submit drives useNavigation() through "submitting" →
    // "loading" → "idle", commits the action data, follows redirects safely
    // (CSRF header + same-origin guard), and revalidates loaders.
    await submit(url, { method, body: new FormData(target) });
  }

  return (
    <form method={method} onSubmit={(e) => { void handleSubmit(e); }} {...rest}>
      {children}
    </form>
  );
}
