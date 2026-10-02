/** True when the module opens with a `"use server"` directive prologue. */
export declare function hasServerDirective(src: string): boolean;
/** True when the module opens with a `"use client"` directive prologue. */
export declare function hasClientDirective(src: string): boolean;
/**
 * Where `"use server"` actions may live: a route module (`routes/…`) or a
 * `*.server.ts(x)` file, as an appDir-relative path. Only these files are
 * scanned and published as `/_action` endpoints — a directive anywhere else is
 * ignored (and the build warns), so a stray directive in a shared helper can't
 * turn it into a public endpoint.
 */
export declare function isActionModulePath(rel: string): boolean;
