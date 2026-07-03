import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, Link, useActionData, useLoaderData, validate } from "@bractjs/bractjs";
import { requirePermission } from "../../../auth.server.ts";
import { flashFail, flashRedirect } from "../../../flash.server.ts";
import { type FormState, fromValidationError } from "../../../form.ts";
import { listRoles, type Role, setUserRoles } from "../../../models/rbac.server.ts";
import { createUser } from "../../../models/users.server.ts";
import { ErrorNote, Field, input, primaryButton } from "../../../ui.tsx";
import { UserCreateSchema, type UserInput } from "../../../validation.ts";

type Data = { roles: Role[] };

export async function loader({ request }: LoaderArgs): Promise<Data> {
  await requirePermission(request, "users.manage");
  return { roles: listRoles() };
}

export async function action({ request, formData }: ActionArgs): Promise<FormState | Response> {
  await requirePermission(request, "users.manage");
  let data: UserInput;
  try {
    data = await validate<UserInput>(UserCreateSchema, formData);
  } catch (err) {
    return flashFail(await fromValidationError(err));
  }
  const res = await createUser(data);
  if (!res.ok || !res.user) return flashFail({ error: res.reason, fieldErrors: { username: [res.reason!] } });
  setUserRoles(res.user.id, formData.getAll("roles").map(String));
  return flashRedirect("/admin/users", "User created");
}

export function meta() {
  return [{ title: "New user | CMS Admin" }];
}

export default function NewUser() {
  const { roles } = useLoaderData<Data>();
  const state = useActionData<FormState>();
  const fe = state?.fieldErrors ?? {};
  return (
    <>
      <div className="admin-bar">
        <h1 style={{ margin: 0 }}>New user</h1>
        <Link to="/admin/users" style={{ color: "var(--admin-accent)", textDecoration: "none" }}>
          ← All users
        </Link>
      </div>
      <div className="admin-panel" style={{ maxWidth: "520px" }}>
        <Form method="post" style={{ display: "grid", gap: ".7rem" }}>
          <Field label="Username">
            <input name="username" required autoComplete="off" className={input} />
          </Field>
          {fe.username ? <ErrorNote>{fe.username[0]}</ErrorNote> : null}
          <Field label="Display name">
            <input name="displayName" className={input} />
          </Field>
          <Field label="Email" hint="The 2FA sign-in code is sent here.">
            <input name="email" type="email" required autoComplete="off" className={input} />
          </Field>
          {fe.email ? <ErrorNote>{fe.email[0]}</ErrorNote> : null}
          <fieldset
            style={{ border: "1px solid var(--admin-line)", borderRadius: "8px", padding: ".6rem .8rem" }}
          >
            <legend style={{ fontSize: ".78rem", color: "var(--admin-muted)", textTransform: "uppercase" }}>
              Roles
            </legend>
            <div style={{ display: "grid", gap: ".3rem" }}>
              {roles.map((r) => (
                <label
                  key={r.id}
                  style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}
                >
                  <input type="checkbox" name="roles" value={r.id} defaultChecked={r.name === "Editor"} />{" "}
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Password" hint="At least 6 characters.">
            <input name="password" type="password" required autoComplete="new-password" className={input} />
          </Field>
          {fe.password ? <ErrorNote>{fe.password[0]}</ErrorNote> : null}
          {state?.error && !fe.username ? <ErrorNote>{state.error}</ErrorNote> : null}
          <div>
            <button type="submit" className={primaryButton}>
              Create user
            </button>
          </div>
        </Form>
      </div>
    </>
  );
}
