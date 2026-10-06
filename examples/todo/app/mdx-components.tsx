// Styles for MDX routes (app/routes/*.mdx): each Markdown element renders
// with these components. BractJS passes them to every MDX page.
import { Link } from "@bractjs/bractjs";
import type { ComponentProps } from "react";

const linkClass = "font-semibold text-teal hover:text-ink";

export const components = {
  h1: (props: ComponentProps<"h1">) => <h1 className="mb-4 text-3xl font-bold tracking-tight" {...props} />,
  h2: (props: ComponentProps<"h2">) => <h2 className="mt-8 mb-3 text-xl font-semibold" {...props} />,
  p: (props: ComponentProps<"p">) => <p className="mb-4 leading-relaxed text-ink/90" {...props} />,
  ul: (props: ComponentProps<"ul">) => <ul className="mb-4 list-disc space-y-1 pl-6" {...props} />,
  code: (props: ComponentProps<"code">) => (
    <code className="rounded bg-teal-ink/10 px-1.5 py-0.5 font-mono text-[0.9em]" {...props} />
  ),
  // In-app links soft-navigate like any <Link>; external ones stay plain.
  a: ({ href = "", children }: ComponentProps<"a">) =>
    href.startsWith("/") ? (
      <Link to={href} className={linkClass}>
        {children}
      </Link>
    ) : (
      <a href={href} className={linkClass}>
        {children}
      </a>
    ),
};
