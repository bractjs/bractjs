// app/todos.server.ts
//
// Server-only data layer. The `.server.ts` suffix is a BractJS convention:
// client bundles get an inert stub instead of this module, so the store and
// the functions below never reach the browser.
//
// An in-memory store keeps the demo zero-setup, resets on restart, and runs on
// every runtime BractJS supports (Bun, and Node or Deno after
// `bractjs build --target node`). Swap it for a database in a real app —
// examples/cms uses bun:sqlite.

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
};

export type Filter = "all" | "active" | "completed";

export type TodoStats = {
  total: number;
  active: number;
  completed: number;
};

const todos = new Map<string, Todo>();

// Seed a few rows once, so a fresh boot isn't an empty board.
function seed() {
  const now = Date.now();
  const samples: Array<[string, boolean, number]> = [
    ["Read the BractJS routing docs", true, now - 5_000],
    ["Ship a multi-route demo app", false, now - 2_000],
    ["Celebrate the tiny wins", false, now - 1_000],
  ];
  for (const [title, completed, createdAt] of samples) {
    const id = crypto.randomUUID();
    todos.set(id, { id, title, completed, createdAt });
  }
}
seed();

// ── Queries ────────────────────────────────────────────────────────────────

const copy = (todo: Todo): Todo => ({ ...todo });

export function listTodos(filter: Filter = "all"): Todo[] {
  return [...todos.values()]
    .filter((t) => (filter === "active" ? !t.completed : filter === "completed" ? t.completed : true))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(copy);
}

export function getTodo(id: string): Todo | null {
  const todo = todos.get(id);
  return todo ? copy(todo) : null;
}

export function getStats(): TodoStats {
  const total = todos.size;
  const completed = [...todos.values()].filter((t) => t.completed).length;
  return { total, active: total - completed, completed };
}

export function addTodo(title: string): Todo {
  const todo: Todo = { id: crypto.randomUUID(), title, completed: false, createdAt: Date.now() };
  todos.set(todo.id, todo);
  return copy(todo);
}

/** Toggle completion. Returns the new state, or null if the id is unknown. */
export function toggleTodo(id: string): boolean | null {
  const todo = todos.get(id);
  if (!todo) return null;
  todo.completed = !todo.completed;
  return todo.completed;
}

/** Rename a todo. Returns false if the id is unknown. */
export function renameTodo(id: string, title: string): boolean {
  const todo = todos.get(id);
  if (!todo) return false;
  todo.title = title;
  return true;
}

/** Delete a todo. Returns false if the id is unknown. */
export function deleteTodo(id: string): boolean {
  return todos.delete(id);
}

/** Delete every completed todo. Returns how many were removed. */
export function clearCompleted(): number {
  let removed = 0;
  for (const [id, todo] of todos) {
    if (todo.completed) {
      todos.delete(id);
      removed++;
    }
  }
  return removed;
}
