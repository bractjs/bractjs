// app/todos.server.ts
//
// Server-only data layer. The `.server.ts` suffix is a BractJS convention:
// importing this module from client code is a hard build error, so the
// `bun:sqlite` handle and the queries below never reach the browser bundle.
//
// We use an in-memory SQLite database so the demo needs zero setup and resets
// cleanly each time the process restarts. Swap `":memory:"` for a file path
// (e.g. `"todos.db"`) to persist across restarts.

import { Database } from "bun:sqlite";

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

const db = new Database(":memory:");

db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  )
`);

// SQLite stores booleans as 0/1 — map rows back to a typed `Todo`.
type Row = { id: string; title: string; completed: number; createdAt: number };

function toTodo(row: Row): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    createdAt: row.createdAt,
  };
}

// Seed a few rows once, so a fresh boot isn't an empty board.
function seed() {
  const count = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM todos").get()?.n ?? 0;
  if (count > 0) return;
  const now = Date.now();
  const samples: Array<[string, boolean, number]> = [
    ["Read the BractJS routing docs", true, now - 5_000],
    ["Ship a multi-route demo app", false, now - 2_000],
    ["Celebrate the tiny wins", false, now - 1_000],
  ];
  for (const [title, completed, createdAt] of samples) {
    db.run("INSERT INTO todos (id, title, completed, createdAt) VALUES (?, ?, ?, ?)", [
      crypto.randomUUID(),
      title,
      completed ? 1 : 0,
      createdAt,
    ]);
  }
}
seed();

// ── Queries ────────────────────────────────────────────────────────────────

export function listTodos(filter: Filter = "all"): Todo[] {
  let sql = "SELECT id, title, completed, createdAt FROM todos";
  if (filter === "active") sql += " WHERE completed = 0";
  else if (filter === "completed") sql += " WHERE completed = 1";
  sql += " ORDER BY createdAt DESC";
  return db.query<Row, []>(sql).all().map(toTodo);
}

export function getTodo(id: string): Todo | null {
  const row = db
    .query<Row, [string]>("SELECT id, title, completed, createdAt FROM todos WHERE id = ?")
    .get(id);
  return row ? toTodo(row) : null;
}

export function getStats(): TodoStats {
  const total = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM todos").get()?.n ?? 0;
  const completed =
    db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM todos WHERE completed = 1").get()?.n ?? 0;
  return { total, active: total - completed, completed };
}

export function addTodo(title: string): Todo {
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    completed: false,
    createdAt: Date.now(),
  };
  db.run("INSERT INTO todos (id, title, completed, createdAt) VALUES (?, ?, ?, ?)", [
    todo.id,
    todo.title,
    0,
    todo.createdAt,
  ]);
  return todo;
}

/** Toggle completion. Returns the new state, or null if the id is unknown. */
export function toggleTodo(id: string): boolean | null {
  const todo = getTodo(id);
  if (!todo) return null;
  const next = !todo.completed;
  db.run("UPDATE todos SET completed = ? WHERE id = ?", [next ? 1 : 0, id]);
  return next;
}

/** Rename a todo. Returns false if the id is unknown. */
export function renameTodo(id: string, title: string): boolean {
  const result = db.run("UPDATE todos SET title = ? WHERE id = ?", [title, id]);
  return result.changes > 0;
}

/** Delete a todo. Returns false if the id is unknown. */
export function deleteTodo(id: string): boolean {
  const result = db.run("DELETE FROM todos WHERE id = ?", [id]);
  return result.changes > 0;
}

/** Delete every completed todo. Returns how many rows were removed. */
export function clearCompleted(): number {
  return db.run("DELETE FROM todos WHERE completed = 1").changes;
}
