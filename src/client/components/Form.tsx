import { useContext, type FormEvent, type ReactNode, type FormHTMLAttributes } from "react";
import { RouterContext, NavigationContext } from "../router.tsx";
import { reloadLoaders } from "../form-utils.ts";

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

  const { pathname, setRoute } = routerCtx;
  const { navigate } = navCtx;

  // setLoaderData shim — updates just the loaderData slice via setRoute
  function setLoaderData(data: Record<string, unknown>) {
    setRoute({ loaderData: data });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRoute({ actionData: null }); // clear stale action data

    const target = e.currentTarget;
    const url = action ?? pathname;
    const formData = new FormData(target);

    const response = await fetch(url, {
      method: method.toUpperCase(),
      body: formData,
      headers: { "X-BractJS-Action": "1" },
    });

    // The action returned (or threw) a redirect. The browser auto-follows the
    // 3xx, so `response.url` is the *absolute* final URL — normalize it to a
    // same-origin path before handing it to the client router, which matches a
    // route pattern against the pathname (an absolute URL wouldn't match).
    if (response.redirected) {
      let to = response.url;
      try {
        const u = new URL(response.url, window.location.href);
        if (u.origin === window.location.origin) to = u.pathname + u.search + u.hash;
      } catch { /* keep response.url as-is */ }
      await navigate(to);
      return;
    }

    const actionData = (await response.json()) as unknown;
    setRoute({ actionData });
    await reloadLoaders(pathname, setLoaderData);
  }

  return (
    <form method={method} onSubmit={(e) => { void handleSubmit(e); }} {...rest}>
      {children}
    </form>
  );
}
