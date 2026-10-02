// app/routes/_index.tsx → "/"
//
// The board: a filterable list, an add form, and inline toggle/delete.
// Data lives in `todos.server.ts` (SQLite); this file only orchestrates
// loader → action → <Form> revalidation.

import type { LoaderArgs } from "@bractjs/bractjs";
import {
  defineActions,
  Form,
  formText,
  Link,
  safeValidate,
  useActionData,
  useLoaderData,
  useNavigation,
  useLocale,
  useSearch,
} from "@bractjs/bractjs";
import { Circle, CircleCheck, Eraser, LoaderCircle, Plus, Trash2 } from "lucide-react";

import {
  addTodo,
  clearCompleted,
  deleteTodo,
  type Filter,
  getStats,
  listTodos,
  toggleTodo,
} from "../todos.server.ts";
import { Button, ErrorNote, IconButton, input, panel, useActionToast } from "../ui.tsx";
import { type BoardSearch, BoardSearchSchema, type TodoInput, TodoTitleSchema } from "../validation.ts";

// Filter tabs: the value in `?filter=` and what the tab says.
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Open" },
  { value: "completed", label: "Done" },
];

// Validates/coerces `?filter=` BEFORE the loader runs. The loader receives the
// output via `search`; the component reads the same object with useSearch().
export const searchSchema = BoardSearchSchema;

export function meta() {
  return [
    { title: "Todo Board | BractJS" },
    {
      name: "description",
      content:
        "A multi-route BractJS demo: SQLite-backed loaders, actions, validation, and <Form> revalidation.",
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
  toggle: ({ formData }) => {
    toggleTodo(formText(formData, "id"));
    return { ok: "Task updated" };
  },
  delete: ({ formData }) => {
    deleteTodo(formText(formData, "id"));
    return { ok: "Task deleted" };
  },
  "clear-completed": () => {
    clearCompleted();
    return { ok: "Done tasks cleared" };
  },
});

export default function IndexPage() {
  const { todos, stats } = useLoaderData<typeof loader>();
  // The validated search object (same shape the loader saw) — no string parsing.
  const { filter } = useSearch<BoardSearch>();
  const actionData = useActionData<{ error?: string; ok?: string }>();
  useActionToast(actionData);
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  // i18n: "/fr" renders this same route in French (see bractjs.config.ts).
  const locale = useLocale();
  const counts: Record<Filter, number> = {
    all: stats.total,
    active: stats.active,
    completed: stats.completed,
  };

  return (
    <main className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {locale === "fr" ? "Tableau des tâches" : "Todo board"}
        </h1>
        <p className="text-muted">
          Tasks live in a <code>bun:sqlite</code> store inside a <code>*.server.ts</code> module. Open one to
          rename it.
        </p>
      </header>

      {/* Keyed on the task count, so the input clears after each add. */}
      <Form method="post" intent="add" key={stats.total} className="grid gap-2">
        <label htmlFor="title" className="text-sm font-semibold">
          New task
        </label>
        <div className="flex gap-2">
          <input
            id="title"
            name="title"
            type="text"
            maxLength={120}
            required
            placeholder="What needs doing?"
            className={input}
          />
          <Button type="submit" tone="primary" icon={busy ? LoaderCircle : Plus} spin={busy} disabled={busy}>
            {busy ? "Adding…" : "Add task"}
          </Button>
        </div>
        {actionData?.error ? <ErrorNote>{actionData.error}</ErrorNote> : null}
      </Form>

      <section aria-label="Tasks" className={`${panel} overflow-hidden`}>
        <nav aria-label="Filter tasks" className="flex border-b border-line bg-sunken">
          {FILTERS.map(({ value, label }) => {
            const active = value === filter;
            return (
              <Link
                key={value}
                to="/"
                search={value === "all" ? {} : { filter: value }}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                  active ? "bg-surface text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {label}
                <span
                  className={`min-w-6 rounded px-1.5 text-center tabular-nums ${
                    value === "completed"
                      ? "bg-teal text-teal-ink"
                      : value === "active"
                        ? "bg-marigold text-[#17262b]"
                        : "bg-ink text-canvas"
                  }`}
                >
                  {counts[value]}
                </span>
              </Link>
            );
          })}
        </nav>

        {todos.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">
            {filter === "all"
              ? "Nothing on the board. Add a task above."
              : filter === "active"
                ? "No open tasks."
                : "No done tasks yet."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className={`flex items-center gap-2 border-l-4 py-2 pr-2 pl-2 ${
                  todo.completed ? "border-l-teal" : "border-l-marigold"
                }`}
              >
                <Form method="post" intent="toggle" className="contents">
                  <input type="hidden" name="id" value={todo.id} />
                  <IconButton
                    type="submit"
                    icon={todo.completed ? CircleCheck : Circle}
                    label={todo.completed ? "Mark as open" : "Mark as done"}
                    className={todo.completed ? "text-teal" : ""}
                  />
                </Form>
                <Link
                  to={`/${todo.id}`}
                  prefetch="hover"
                  className={`min-w-0 flex-1 py-1 [overflow-wrap:anywhere] hover:underline ${
                    todo.completed ? "text-muted line-through" : ""
                  }`}
                >
                  {todo.title}
                </Link>
                <Form method="post" intent="delete" className="contents">
                  <input type="hidden" name="id" value={todo.id} />
                  <IconButton type="submit" icon={Trash2} label="Delete task" tone="danger" />
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stats.completed > 0 ? (
        <Form method="post" intent="clear-completed" className="justify-self-end">
          <Button type="submit" icon={Eraser}>
            Clear {stats.completed} done {stats.completed === 1 ? "task" : "tasks"}
          </Button>
        </Form>
      ) : null}
    </main>
  );
}
