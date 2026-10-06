/** A variable's parser. Built with `env.string()`, `env.url()`, … */
export interface EnvVar<T> {
    /** Allow the variable to be unset (or empty): its value is `undefined`. */
    optional(): EnvVar<T | undefined>;
    /** Use `value` when the variable is unset (or empty). */
    default(value: NonNullable<T>): EnvVar<NonNullable<T>>;
}
/** Validators for `defineEnv()`. Each reads the variable's string value. */
export declare const env: {
    /** Any non-empty string. */
    string(options?: {
        minLength?: number;
        pattern?: RegExp;
    }): EnvVar<string>;
    /** A number (`"8080"`, `"0.5"`). */
    number(options?: {
        min?: number;
        max?: number;
        integer?: boolean;
    }): EnvVar<number>;
    /** `true`/`1`/`yes`/`on` or `false`/`0`/`no`/`off`. */
    boolean(): EnvVar<boolean>;
    /** An absolute URL. `protocols` limits the scheme, e.g. `["https:"]`. */
    url(options?: {
        protocols?: string[];
    }): EnvVar<string>;
    /** One of `values`. */
    enum<const V extends readonly [string, ...string[]]>(values: V): EnvVar<V[number]>;
};
interface StandardSchema<O> {
    readonly "~standard": {
        validate(value: unknown): StandardResult<O> | Promise<StandardResult<O>>;
        readonly types?: {
            readonly output: O;
        };
    };
}
type StandardResult<O> = {
    value: O;
    issues?: undefined;
} | {
    issues: ReadonlyArray<{
        message: string;
    }>;
};
interface SafeParseSchema<O> {
    safeParse(value: unknown): {
        success: boolean;
        data?: O;
        error?: {
            issues?: Array<{
                message: string;
            }>;
        };
    };
}
/** A variable: a built-in validator, or a Standard Schema / Zod-style schema (synchronous). */
export type EnvSchema = EnvVar<unknown> | StandardSchema<unknown> | SafeParseSchema<unknown>;
/** The value a schema produces. */
export type EnvOutput<S> = S extends EnvVar<infer T> ? T : S extends StandardSchema<infer O> ? O : S extends SafeParseSchema<infer O> ? O : never;
type Shape = Record<string, EnvSchema>;
type Values<S extends Shape> = {
    readonly [K in keyof S]: EnvOutput<S[K]>;
};
export interface EnvSpec<S extends Shape, C extends Shape> {
    /** Server-only variables. Reading one in the browser throws. */
    server?: S;
    /** Variables the browser may read too. Their values are sent to it in every page — never put a secret here. */
    client?: C;
}
/** Thrown at startup when variables are missing or invalid; lists every problem. */
export declare class EnvError extends Error {
    readonly issues: string[];
    constructor(issues: string[]);
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
export declare function defineEnv<S extends Shape = Record<never, never>, C extends Shape = Record<never, never>>(spec: EnvSpec<S, C>, options?: {
    source?: Record<string, string | undefined>;
}): Values<S> & Values<C>;
export {};
