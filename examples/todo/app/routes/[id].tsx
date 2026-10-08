// app/routes/[id].tsx → "/:id"
//
// A dynamic route. `params.id` comes from the `[id]` filename. The loader
// throws `HttpError(404)` for an unknown id (rendered by the ErrorBoundary
// below). The route action handles toggle / delete; renaming is a React 19
// form action backed by a "use server" function (app/actions.server.ts).

import type { LoaderArgs, MetaArgs } from "@bractjs/bractjs";
import {
  defineActions,
  Form,
  HttpError,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useParams,
  useRevalidator,
} from "@bractjs/bractjs";
import {
  ArrowLeft,
  Check,
  Circle,
  CircleCheck,
  Link2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  SearchX,
  Trash2,
} from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { renameTask } from "../actions.server.ts";
import { deleteTodo, getTodo, toggleTodo } from "../todos.server.ts";
import { Button, ErrorNote, input, panel, useActionToast } from "../ui.tsx";

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

const backLink = "inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:text-ink";

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <main className={`${panel} grid justify-items-start gap-3 p-6`}>
      <span className="grid size-11 place-items-center rounded-md bg-marigold text-[#17262b]">
        <SearchX aria-hidden size={22} strokeWidth={2.25} />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Task not found</h1>
      <p className="text-muted">{message} It may have been deleted.</p>
      {/* Route-relative (React Router): `..` climbs one route — from this page,
          which has no layout above it, that is the board. */}
      <Link to=".." className={backLink}>
        <ArrowLeft aria-hidden size={16} strokeWidth={2.5} />
        Back to the board
      </Link>
    </main>
  );
}

export default function TodoDetail() {
  const { todo } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; ok?: string }>();
  useActionToast(actionData);

  // Typed routing: the route literal types `id` as a string, and `navigate`
  // type-checks both the target route and its params against this app's routes.
  const { id } = useParams<"/:id">();
  const navigate = useNavigate();

  // Manual loader revalidation — refetches this page's data without navigating
  // (useful if another tab/process edits the store).
  const { revalidate, state: revalidating } = useRevalidator();

  return (
    <main className="grid gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Plain-string `to` — still valid (backwards compatible). */}
        <Link to="/" prefetch="hover" className={backLink}>
          <ArrowLeft aria-hidden size={16} strokeWidth={2.5} />
          Board
        </Link>
        {/* Typed dynamic `to` with checked `params` — autocompletes "/:id". */}
        <Link
          to="/:id"
          params={{ id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <Link2 aria-hidden size={15} />
          Permalink
        </Link>
        <div className="ml-auto flex gap-2">
          {/* Manual revalidation via useRevalidator. */}
          <Button
            icon={RefreshCw}
            spin={revalidating === "loading"}
            disabled={revalidating === "loading"}
            onClick={() => {
              void revalidate();
            }}
          >
            {revalidating === "loading" ? "Refreshing…" : "Refresh"}
          </Button>
          {/* Imperative typed navigation via useNavigate. */}
          <Button
            icon={Check}
            onClick={() => {
              void navigate("/");
            }}
          >
            Done editing
          </Button>
        </div>
      </div>

      <section
        className={`${panel} grid gap-5 border-l-4 p-6 ${todo.completed ? "border-l-teal" : "border-l-marigold"}`}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`rounded px-2 py-0.5 font-semibold ${
              todo.completed ? "bg-teal text-teal-ink" : "bg-marigold text-[#17262b]"
            }`}
          >
            {todo.completed ? "Done" : "Open"}
          </span>
          <span className="text-muted">Created {new Date(todo.createdAt).toLocaleString()}</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">{todo.title}</h1>

        {/* React 19 form action: a "use server" function + useActionState. */}
        <RenameForm id={todo.id} title={todo.title} />

        <div className="flex flex-wrap gap-2 border-t border-line pt-5">
          <Form method="post" intent="toggle">
            <Button type="submit" icon={todo.completed ? Circle : CircleCheck}>
              {todo.completed ? "Mark as open" : "Mark as done"}
            </Button>
          </Form>
          <Form method="post" intent="delete">
            <Button type="submit" tone="danger" icon={Trash2}>
              Delete task
            </Button>
          </Form>
        </div>
      </section>
    </main>
  );
}

// The rename form runs a server action through React 19's useActionState: the
// action's return value becomes `state`, `isPending` covers the round trip,
// and BractJS revalidates the loader afterwards — the heading above updates.
function RenameForm({ id, title }: { id: string; title: string }) {
  const [state, formAction] = useActionState(renameTask, null);
  useActionToast(state);
  return (
    <form action={formAction} key={title} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="title" className="text-sm font-semibold">
        Rename task
      </label>
      <div className="flex gap-2">
        <input
          id="title"
          name="title"
          type="text"
          maxLength={120}
          required
          defaultValue={title}
          className={input}
        />
        <SaveButton />
      </div>
      {state?.error ? <ErrorNote>{state.error}</ErrorNote> : null}
    </form>
  );
}

// useFormStatus reads the pending state of the <form> it's rendered inside.
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      tone="primary"
      icon={pending ? LoaderCircle : Pencil}
      spin={pending}
      disabled={pending}
    >
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
