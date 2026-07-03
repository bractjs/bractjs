// app/routes/[id].tsx → "/:id"
//
// A dynamic route. `params.id` comes from the `[id]` filename. The loader
// throws `HttpError(404)` for an unknown id (rendered by the ErrorBoundary
// below), and the action handles rename / toggle / delete.

import type { LoaderArgs, MetaArgs } from "@bractjs/bractjs";
import {
  defineActions,
  Form,
  HttpError,
  Link,
  redirect,
  safeValidate,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useParams,
  useRevalidator,
} from "@bractjs/bractjs";

import { deleteTodo, getTodo, renameTodo, toggleTodo } from "../todos.server.ts";
import { card, dangerButton, ErrorNote, ghostButton, input, primaryButton, useActionToast } from "../ui.tsx";
import { type TodoInput, TodoTitleSchema } from "../validation.ts";

export async function loader({ params }: LoaderArgs) {
  const todo = getTodo(params.id);
  if (!todo) throw new HttpError(404, "That task does not exist.");
  return { todo };
}

export function meta({ loaderData }: MetaArgs<Awaited<ReturnType<typeof loader>>>) {
  return [
    { title: `${loaderData.todo.title} | Todo` },
    { name: "description", content: `Edit "${loaderData.todo.title}".` },
  ];
}

// One handler per intent; `<Form intent>` renders the matching hidden input.
export const action = defineActions({
  rename: async ({ params, formData }) => {
    const result = await safeValidate<TodoInput>(TodoTitleSchema, formData);
    if (!result.ok) return { error: result.firstError };
    renameTodo(params.id, result.data.title);
    return { ok: "Task renamed" };
  },
  toggle: ({ params }) => {
    toggleTodo(params.id);
    return { ok: "Task updated" };
  },
  // Redirects back to the board; the toast there is fired by the board's delete.
  delete: ({ params }) => {
    deleteTodo(params.id);
    return redirect("/");
  },
});

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <main style={{ ...card, display: "grid", gap: ".8rem" }}>
      <h1 style={{ margin: 0 }}>Task not found</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{message}</p>
      <Link to="/" style={{ color: "var(--accent)", fontWeight: 600 }}>
        ← Back to the board
      </Link>
    </main>
  );
}

export default function TodoDetail() {
  const { todo } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; ok?: string }>();
  useActionToast(actionData);
  const nav = useNavigation();
  const busy = nav.state === "submitting";

  // Typed routing: the route literal types `id` as a string, and `navigate`
  // type-checks both the target route and its params against this app's routes.
  const { id } = useParams<"/:id">();
  const navigate = useNavigate();

  // Manual loader revalidation — refetches this page's data without navigating
  // (useful if another tab/process edits the store).
  const { revalidate, state: revalidating } = useRevalidator();

  return (
    <main style={{ display: "grid", gap: "1rem" }}>
      <p style={{ margin: 0, display: "flex", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
        {/* Plain-string `to` — still valid (backwards compatible). */}
        <Link
          to="/"
          prefetch="hover"
          style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
        >
          ← Back to the board
        </Link>
        {/* Typed dynamic `to` with checked `params` — autocompletes "/:id". */}
        <Link
          to="/:id"
          params={{ id }}
          style={{ color: "var(--muted)", fontSize: ".82rem", textDecoration: "none" }}
        >
          Permalink
        </Link>
        {/* Manual revalidation via useRevalidator. */}
        <button
          type="button"
          onClick={() => {
            void revalidate();
          }}
          disabled={revalidating === "loading"}
          style={{ ...ghostButton, padding: ".3rem .7rem", fontSize: ".82rem", marginLeft: "auto" }}
        >
          {revalidating === "loading" ? "Refreshing…" : "↻ Refresh"}
        </button>
        {/* Imperative typed navigation via useNavigate. */}
        <button
          type="button"
          onClick={() => {
            void navigate("/");
          }}
          style={{ ...ghostButton, padding: ".3rem .7rem", fontSize: ".82rem" }}
        >
          Done editing →
        </button>
      </p>

      <section style={{ ...card, display: "grid", gap: ".9rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: ".6rem", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: ".74rem",
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: todo.completed ? "#2f7d32" : "#0f8b8d",
            }}
          >
            {todo.completed ? "Completed" : "Active"}
          </span>
          <span style={{ color: "var(--muted)", fontSize: ".82rem" }}>
            Created {new Date(todo.createdAt).toLocaleString()}
          </span>
        </div>

        <h1 style={{ margin: 0, overflowWrap: "anywhere" }}>{todo.title}</h1>

        <Form method="post" intent="rename" key={todo.title} style={{ display: "grid", gap: ".6rem" }}>
          <label htmlFor="title" style={{ fontWeight: 600 }}>
            Rename task
          </label>
          <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
            <input
              id="title"
              name="title"
              type="text"
              maxLength={120}
              required
              defaultValue={todo.title}
              style={{ ...input, flex: "1 1 260px", width: "auto" }}
            />
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </Form>

        {actionData?.error ? <ErrorNote>{actionData.error}</ErrorNote> : null}

        <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
          <Form method="post" intent="toggle" style={{ margin: 0 }}>
            <button type="submit" style={{ ...ghostButton, padding: ".5rem .85rem" }}>
              {todo.completed ? "Mark as active" : "Mark as completed"}
            </button>
          </Form>

          <Form method="post" intent="delete" style={{ margin: 0 }}>
            <button type="submit" style={{ ...dangerButton, padding: ".5rem .85rem" }}>
              Delete task
            </button>
          </Form>
        </div>
      </section>
    </main>
  );
}
