// Typed, validated environment variables: `defineEnv()` in `app/env.ts`.
//
// On the server (dev, start, the compiled binary, the Node build) it validates
// every variable against process.env when app/env.ts is first imported — which
// BractJS does at startup — and throws one error listing all the problems.
// The `client` variables' values are then sent to the browser in each page's
// bootstrap payload (`__BRACTJS_DATA__.env`), where defineEnv reads them: both
// sides render the same values, and one build runs in any environment.
// Reading a `server` variable in the browser throws.

const PUBLIC_ENV = Symbol.for("bractjs.publicEnv");

/** @internal The `client` variables' raw values, for the page payload (server only). */
export function getPublicEnv(): Record<string, string> | undefined {
  return (globalThis as { [PUBLIC_ENV]?: Record<string, string> })[PUBLIC_ENV];
}

function publishEnv(values: Record<string, string>): void {
  const g = globalThis as { [PUBLIC_ENV]?: Record<string, string> };
  g[PUBLIC_ENV] = { ...g[PUBLIC_ENV], ...values };
}

function browserEnv(): Record<string, string | undefined> | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return (window as { __BRACTJS_DATA__?: { env?: Record<string, string> } }).__BRACTJS_DATA__?.env ?? {};
}

// ── Validators ─────────────────────────────────────────────────────────────

/** A variable's parser. Built with `env.string()`, `env.url()`, … */
export interface EnvVar<T> {
  /** @internal */
  readonly parse: (raw: string | undefined) => T;
  /** Allow the variable to be unset (or empty): its value is `undefined`. */
  optional(): EnvVar<T | undefined>;
  /** Use `value` when the variable is unset (or empty). */
  default(value: NonNullable<T>): EnvVar<NonNullable<T>>;
}

class EnvIssue extends Error {}

function variable<T>(check: (raw: string) => T): EnvVar<T> {
  const unset = (raw: string | undefined): raw is undefined | "" => raw === undefined || raw === "";
  // `optional()` / `default()` always wrap the base check, whatever was chained before.
  const make = <U>(parse: (raw: string | undefined) => U): EnvVar<U> => ({
    parse,
    optional: () => make((raw) => (unset(raw) ? undefined : check(raw))) as unknown as EnvVar<U | undefined>,
    default: (value) => make((raw) => (unset(raw) ? value : check(raw))) as unknown as EnvVar<NonNullable<U>>,
  });
  return make((raw) => {
    if (unset(raw)) throw new EnvIssue("is required but not set");
    return check(raw);
  });
}

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

/** Validators for `defineEnv()`. Each reads the variable's string value. */
export const env = {
  /** Any non-empty string. */
  string(options: { minLength?: number; pattern?: RegExp } = {}): EnvVar<string> {
    return variable((raw) => {
      if (options.minLength !== undefined && raw.length < options.minLength) {
        throw new EnvIssue(`must be at least ${options.minLength} characters`);
      }
      if (options.pattern && !options.pattern.test(raw)) throw new EnvIssue(`must match ${options.pattern}`);
      return raw;
    });
  },
  /** A number (`"8080"`, `"0.5"`). */
  number(options: { min?: number; max?: number; integer?: boolean } = {}): EnvVar<number> {
    return variable((raw) => {
      const n = Number(raw.trim());
      if (raw.trim() === "" || !Number.isFinite(n)) throw new EnvIssue(`must be a number, got "${raw}"`);
      if (options.integer && !Number.isInteger(n)) throw new EnvIssue(`must be an integer, got "${raw}"`);
      if (options.min !== undefined && n < options.min) throw new EnvIssue(`must be ≥ ${options.min}`);
      if (options.max !== undefined && n > options.max) throw new EnvIssue(`must be ≤ ${options.max}`);
      return n;
    });
  },
  /** `true`/`1`/`yes`/`on` or `false`/`0`/`no`/`off`. */
  boolean(): EnvVar<boolean> {
    return variable((raw) => {
      const v = raw.trim().toLowerCase();
      if (TRUE.has(v)) return true;
      if (FALSE.has(v)) return false;
      throw new EnvIssue(`must be true/false (or 1/0, yes/no, on/off), got "${raw}"`);
    });
  },
  /** An absolute URL. `protocols` limits the scheme, e.g. `["https:"]`. */
  url(options: { protocols?: string[] } = {}): EnvVar<string> {
    return variable((raw) => {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw new EnvIssue(`must be an absolute URL, got "${raw}"`);
      }
      if (options.protocols && !options.protocols.includes(url.protocol)) {
        throw new EnvIssue(`must use ${options.protocols.join(" or ")}, got "${url.protocol}"`);
      }
      return raw;
    });
  },
  /** One of `values`. */
  enum<const V extends readonly [string, ...string[]]>(values: V): EnvVar<V[number]> {
    return variable((raw) => {
      if (!values.includes(raw)) throw new EnvIssue(`must be one of ${values.join(", ")}, got "${raw}"`);
      return raw as V[number];
    });
  },
};

// ── Schemas from other libraries ───────────────────────────────────────────

interface StandardSchema<O> {
  readonly "~standard": {
    validate(value: unknown): StandardResult<O> | Promise<StandardResult<O>>;
    readonly types?: { readonly output: O };
  };
}
type StandardResult<O> = { value: O; issues?: undefined } | { issues: ReadonlyArray<{ message: string }> };
interface SafeParseSchema<O> {
  safeParse(value: unknown): { success: boolean; data?: O; error?: { issues?: Array<{ message: string }> } };
}

/** A variable: a built-in validator, or a Standard Schema / Zod-style schema (synchronous). */
export type EnvSchema = EnvVar<unknown> | StandardSchema<unknown> | SafeParseSchema<unknown>;

/** The value a schema produces. */
export type EnvOutput<S> =
  S extends EnvVar<infer T>
    ? T
    : S extends StandardSchema<infer O>
      ? O
      : S extends SafeParseSchema<infer O>
        ? O
        : never;

function runVar(schema: EnvSchema, raw: string | undefined): unknown {
  if ("parse" in schema && "optional" in schema && "default" in schema) {
    return (schema as EnvVar<unknown>).parse(raw);
  }
  if ("~standard" in schema) {
    const result = schema["~standard"].validate(raw);
    if (result instanceof Promise)
      throw new EnvIssue("uses an async schema; environment schemas must be synchronous");
    if (result.issues) throw new EnvIssue(result.issues.map((i) => i.message).join("; "));
    return result.value;
  }
  if ("safeParse" in schema) {
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new EnvIssue(result.error?.issues?.map((i) => i.message).join("; ") ?? "is invalid");
    }
    return result.data;
  }
  throw new TypeError("[bractjs] defineEnv(): unsupported schema");
}

// ── defineEnv ──────────────────────────────────────────────────────────────

type Shape = Record<string, EnvSchema>;
type Values<S extends Shape> = { readonly [K in keyof S]: EnvOutput<S[K]> };

export interface EnvSpec<S extends Shape, C extends Shape> {
  /** Server-only variables. Reading one in the browser throws. */
  server?: S;
  /** Variables the browser may read too. Their values are sent to it in every page — never put a secret here. */
  client?: C;
}

/** Thrown at startup when variables are missing or invalid; lists every problem. */
export class EnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`[bractjs] Invalid environment variables:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

function validate(
  shape: Shape,
  source: Record<string, string | undefined>,
  out: Record<string, unknown>,
  issues: string[],
) {
  for (const [key, schema] of Object.entries(shape)) {
    try {
      out[key] = runVar(schema, source[key]);
    } catch (err) {
      issues.push(`${key} ${err instanceof EnvIssue ? err.message : (err as Error).message}`);
    }
  }
}

/**
 * Declare and validate the app's environment variables, in `app/env.ts`:
 *
 *   import { defineEnv, env } from "@bractjs/bractjs";
 *   export default defineEnv({
 *     server: { DATABASE_URL: env.url(), SESSION_SECRET: env.string({ minLength: 32 }) },
 *     client: { PUBLIC_API_URL: env.url() },
 *   });
 *
 * Import it where you need a variable (`import env from "./env.ts"`); the
 * values are typed. BractJS imports the file at startup in every run mode, so
 * a missing or malformed variable stops the server with a list of all of them.
 * `client` values reach the browser in each page's payload.
 */
export function defineEnv<S extends Shape = Record<never, never>, C extends Shape = Record<never, never>>(
  spec: EnvSpec<S, C>,
  options: { source?: Record<string, string | undefined> } = {},
): Values<S> & Values<C> {
  const server = spec.server ?? ({} as S);
  const client = spec.client ?? ({} as C);
  const both = Object.keys(server).filter((k) => k in client);
  if (both.length)
    throw new TypeError(`[bractjs] defineEnv(): ${both.join(", ")} is in both server and client`);

  const values: Record<string, unknown> = {};
  const issues: string[] = [];
  const inBrowser = browserEnv();
  if (inBrowser && !options.source) {
    validate(client, inBrowser, values, issues);
    if (issues.length) throw new EnvError(issues);
    const serverKeys = new Set(Object.keys(server));
    return new Proxy(Object.freeze(values) as Values<S> & Values<C>, {
      get(target, key, receiver) {
        if (typeof key === "string" && serverKeys.has(key)) {
          throw new Error(`[bractjs] ${key} is a server environment variable; the browser can't read it`);
        }
        return Reflect.get(target, key, receiver);
      },
    });
  }

  const source = options.source ?? process.env;
  validate(server, source, values, issues);
  validate(client, source, values, issues);
  if (issues.length) throw new EnvError(issues);
  // The browser gets the client variables' raw values; it parses them itself.
  if (!options.source) {
    const raw: Record<string, string> = {};
    for (const key of Object.keys(client)) {
      const v = source[key];
      if (v !== undefined && v !== "") raw[key] = v;
    }
    publishEnv(raw);
  }
  return Object.freeze(values) as Values<S> & Values<C>;
}
