// The todo app, tested through BractJS's real request pipeline with
// @bractjs/bractjs/testing — no build, no server. Run: `bun test`.
import { describe, expect, test } from "bun:test";
import { callLoader, createTestApp } from "@bractjs/bractjs/testing";
import { renameTask } from "../actions.server.ts";
import { loader as boardLoader } from "../routes/_index.tsx";
import { addTodo, getTodo } from "../todos.server.ts";

// Run from the app root (`bun test` in examples/todo): appDir defaults to ./app.
const app = await createTestApp();

describe("board", () => {
  test("renders the seeded tasks", async () => {
    const res = await app.get("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Read the BractJS routing docs");
  });

  test("adding a task returns a toast message and shows up in the board data", async () => {
    const res = await app.submit("/", { intent: "add", title: "Write tests" });
    expect(await res.json()).toEqual({ ok: "Task added" });

    const data = await app.data<{ route: { todos: Array<{ title: string }> } }>("/");
    expect(data.route.todos.map((t) => t.title)).toContain("Write tests");
  });

  test("an empty title is rejected by validation", async () => {
    const res = await app.submit("/", { intent: "add", title: "   " });
    expect(await res.json()).toEqual({ error: "Please add a task title." });
  });

  test("the loader filters by the validated search params", async () => {
    const { todos } = await callLoader(boardLoader, { search: { filter: "completed" } });
    expect(todos.every((t) => t.completed)).toBe(true);
  });
});

describe("task page", () => {
  test("an unknown id renders the 404 boundary", async () => {
    const res = await app.get("/no-such-task");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Task not found");
  });

  test("the renameTask server action validates and renames", async () => {
    const todo = addTodo("Old name");
    const form = new FormData();
    form.set("id", todo.id);

    form.set("title", "");
    expect(await renameTask(null, form)).toEqual({ error: "Please add a task title." });

    form.set("title", "New name");
    expect(await renameTask(null, form)).toEqual({ ok: "Task renamed" });
    expect(getTodo(todo.id)?.title).toBe("New name");
  });
});
