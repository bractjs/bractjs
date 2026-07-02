// app/routes/_index.tsx → "/"
//
// The board: a filterable list, an add form, and inline toggle/delete.
// Data lives in `todos.server.ts` (SQLite); this file only orchestrates
// loader → action → <Form> revalidation.

import { Form, Link, useActionData, useLoaderData, useNavigation, useSearch } from "@bractjs/bractjs";
import { defineActions, safeValidate, formText } from "@bractjs/bractjs";
import type { LoaderArgs } from "@bractjs/bractjs";

import {
  addTodo,
  clearCompleted,
  deleteTodo,
  getStats,
  listTodos,
  toggleTodo,
  type Filter,
} from "../todos.server.ts";
import { TodoTitleSchema, BoardSearchSchema, type BoardSearch, type TodoInput } from "../validation.ts";
import { card, dangerButton, ErrorNote, ghostButton, input, primaryButton, StatPill, useActionToast } from "../ui.tsx";

const FILTERS: Filter[] = ["all", "active", "completed"];

// Validates/coerces `?filter=` BEFORE the loader runs. The loader receives the
// output via `search`; the component reads the same object with useSearch().
export const searchSchema = BoardSearchSchema;

export function meta() {
  return [
    { title: "Todo Board | BractJS" },
    {
      name: "description",
      content: "A multi-route BractJS demo: SQLite-backed loaders, actions, validation, and <Form> revalidation.",
    },
  ];
}

// `search` is typed by the schema (BoardSearch) — no cast. The loader's return
// type is what `useLoaderData<typeof loader>()` infers below.
export async function loader({ search }: LoaderArgs<BoardSearch>) {
  return { todos: listTodos(search.filter), stats: getStats() };
}

// One action per intent. `<Form intent="...">` renders the matching hidden
// input; defineActions dispatches on it (unknown intent → 400 automatically).
export const action = defineActions({
  add: async ({ formData }) => {
    // safeValidate returns a result instead of throwing — perfect for inline
    // form errors. `firstError` is the first field message.
    const result = await safeValidate<TodoInput>(TodoTitleSchema, formData);
    if (!result.ok) return { error: result.firstError };
    addTodo(result.data.title);
    return { ok: "Task added" };
  },
  toggle: ({ formData }) => { toggleTodo(formText(formData, "id")); return { ok: "Task updated" }; },
  delete: ({ formData }) => { deleteTodo(formText(formData, "id")); return { ok: "Task deleted" }; },
  "clear-completed": () => { clearCompleted(); return { ok: "Completed tasks cleared" }; },
});

export default function IndexPage() {
  const { todos, stats } = useLoaderData<typeof loader>();
  // The validated search object (same shape the loader saw) — no string parsing.
  const { filter } = useSearch<BoardSearch>();
  const actionData = useActionData<{ error?: string; ok?: string }>();
  useActionToast(actionData);
  const nav = useNavigation();
  const busy = nav.state === "submitting";

  return (
    <main style={{ display: "grid", gap: "1rem" }}>
      <section style={card}>
        <p
          style={{
            margin: 0,
            fontSize: ".78rem",
            letterSpacing: ".08em",
            color: "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          Demo App
        </p>
        <h1 style={{ margin: ".45rem 0 .6rem", fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}>Todo Board</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Backed by a <code>bun:sqlite</code> store in a <code>*.server.ts</code> module. Tap a task to open its{" "}
          detail page, or use the filters below.
        </p>
      </section>

      <section style={{ ...card, display: "grid", gap: ".8rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center" }}>
          <StatPill label="Total" value={stats.total} tone="#132024" />
          <StatPill label="Active" value={stats.active} tone="#0f8b8d" />
          <StatPill label="Completed" value={stats.completed} tone="#2f7d32" />

          <nav
            aria-label="Filter tasks"
            style={{ marginLeft: "auto", display: "inline-flex", gap: ".35rem", flexWrap: "wrap" }}
          >
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Link
                  key={f}
                  to="/"
                  search={f === "all" ? {} : { filter: f }}
                  style={{
                    textTransform: "capitalize",
                    textDecoration: "none",
                    fontSize: ".86rem",
                    fontWeight: active ? 700 : 500,
                    color: active ? "#fff" : "var(--muted)",
                    background: active ? "var(--accent)" : "#fff",
                    border: "1px solid var(--line)",
                    borderRadius: "999px",
                    padding: ".3rem .7rem",
                  }}
                >
                  {f}
                </Link>
              );
            })}
          </nav>
        </div>

        <Form method="post" intent="add" style={{ display: "grid", gap: ".65rem" }}>
          <label htmlFor="title" style={{ fontWeight: 600 }}>
            New task
          </label>
          <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
            <input
              id="title"
              name="title"
              type="text"
              maxLength={120}
              required
              placeholder="What should we ship today?"
              style={{ ...input, flex: "1 1 260px", width: "auto" }}
            />
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? "Adding…" : "Add Task"}
            </button>
          </div>
        </Form>

        {actionData?.error ? <ErrorNote>{actionData.error}</ErrorNote> : null}
      </section>

      <section style={{ ...card, paddingTop: ".6rem" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".55rem" }}>
          {todos.length === 0 ? (
            <li
              style={{
                textAlign: "center",
                color: "var(--muted)",
                padding: "1rem",
                border: "1px dashed var(--line)",
                borderRadius: "10px",
              }}
            >
              {filter === "all" ? "No tasks yet. Add your first one above." : `No ${filter} tasks.`}
            </li>
          ) : null}

          {todos.map((todo) => (
            <li
              key={todo.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems: "center",
                gap: ".45rem",
                border: "1px solid var(--line)",
                background: todo.completed ? "#f1faf5" : "#fff",
                borderRadius: "10px",
                padding: ".6rem .7rem",
              }}
            >
              <Link
                to={`/${todo.id}`}
                prefetch="hover"
                style={{
                  textDecoration: todo.completed ? "line-through" : "none",
                  opacity: todo.completed ? 0.66 : 1,
                  overflowWrap: "anywhere",
                  color: "inherit",
                }}
              >
                {todo.title}
              </Link>

              <Form method="post" intent="toggle" style={{ margin: 0 }}>
                <input type="hidden" name="id" value={todo.id} />
                <button
                  type="submit"
                  aria-label={todo.completed ? "Mark as active" : "Mark as completed"}
                  style={ghostButton}
                >
                  {todo.completed ? "Undo" : "Done"}
                </button>
              </Form>

              <Form method="post" intent="delete" style={{ margin: 0 }}>
                <input type="hidden" name="id" value={todo.id} />
                <button type="submit" aria-label="Delete task" style={dangerButton}>
                  Delete
                </button>
              </Form>
            </li>
          ))}
        </ul>

        {stats.completed > 0 ? (
          <Form method="post" intent="clear-completed" style={{ marginTop: ".9rem" }}>
            <button
              type="submit"
              style={{
                border: "1px solid #d8be95",
                background: "#fff6e9",
                color: "#705323",
                borderRadius: "9px",
                padding: ".48rem .72rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Clear Completed
            </button>
          </Form>
        ) : null}
      </section>
    </main>
  );
}
