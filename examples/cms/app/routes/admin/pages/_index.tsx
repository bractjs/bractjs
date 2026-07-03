import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import type { FormState } from "../../../form.ts";
import { deletePage, type PageNode, pageTreeFlat } from "../../../models/pages.server.ts";
import { Badge, dangerButton, EmptyState, ErrorNote, ghostButton, primaryButton } from "../../../ui.tsx";

export async function loader({ request }: LoaderArgs): Promise<{ pages: PageNode[] }> {
  await requirePermission(request, "pages.manage");
  return { pages: pageTreeFlat() };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "pages.manage");
  if (String(formData.get("intent")) === "delete") {
    const res = deletePage(String(formData.get("id") ?? ""));
    if (!res.ok) return flashFail({ error: res.reason });
    return flashRedirect("/admin/pages", "Page deleted");
  }
  return {};
}

export function meta() {
  return [{ title: "Pages | CMS Admin" }];
}

export default function Pages() {
  const { pages } = useLoaderData<{ pages: PageNode[] }>();
  const state = useActionData<FormState>();
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>Pages</h1>
        <Link to="/admin/pages/new" className={primaryButton}>
          New page
        </Link>
      </div>
      {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {pages.length === 0 ? (
        <EmptyState>
          No pages yet. <Link to="/admin/pages/new">Create one →</Link>
        </EmptyState>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Order</th>
              <th style={{ width: "1%" }}></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <td>
                  <span style={{ color: "var(--muted)" }}>{"— ".repeat(p.depth)}</span>
                  <Link to={`/admin/pages/${p.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {p.title}
                  </Link>
                  <span style={{ color: "var(--muted)", fontSize: ".78rem", marginLeft: ".4rem" }}>
                    <code>/{p.slug}</code>
                  </span>
                </td>
                <td>
                  <Badge tone={p.status === "published" ? "published" : "draft"}>{p.status}</Badge>
                </td>
                <td style={{ color: "var(--muted)" }}>{p.menuOrder}</td>
                <td>
                  <div className="toolbar">
                    <Link to={`/admin/pages/${p.id}`} className={ghostButton}>
                      Edit
                    </Link>
                    <Form method="post" style={{ margin: 0 }}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className={dangerButton}>
                        Delete
                      </button>
                    </Form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
