import type { LoaderArgs } from "../../../../shared/route-types.ts";

// Hand-rolled Zod-compatible schema (the repo has no zod dependency): coerces
// `page` to a positive integer defaulting to 1; passes `tag` through as an
// array. Mirrors what `z.object({ page: z.coerce.number().int().positive()
// .default(1), tag: z.array(z.string()).optional() })` would do.
export const searchSchema = {
  safeParse(input: unknown) {
    const obj = (input ?? {}) as Record<string, unknown>;
    const issues: Array<{ path: (string | number)[]; message: string }> = [];

    let page = 1;
    if (obj.page !== undefined) {
      const n = Number(obj.page);
      if (!Number.isInteger(n) || n < 1) {
        issues.push({ path: ["page"], message: "page must be a positive integer" });
      } else {
        page = n;
      }
    }

    if (issues.length > 0) return { success: false, error: { issues } };

    const data: Record<string, unknown> = { page };
    if (typeof obj.tag === "string") data.tag = [obj.tag];
    else if (Array.isArray(obj.tag)) data.tag = obj.tag;
    return { success: true, data };
  },
};

// Echo the validated search object so tests can assert loaders receive the
// coerced shape, not raw strings.
export function loader({ search }: LoaderArgs) {
  return { receivedSearch: search };
}

export default function SearchDemoPage() {
  return <p>search demo</p>;
}
