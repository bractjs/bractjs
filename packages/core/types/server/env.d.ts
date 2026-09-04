export declare function isDev(): boolean;
export declare function setRuntimeMode(m: "dev" | "prod"): void;
export declare function isDevRuntime(): boolean;
export declare function setDevHmrPort(port: number): void;
export declare function getDevHmrPort(): number;
export declare function bumpDevModuleGeneration(): void;
export declare function devBustedSpecifier(path: string): string;
/**
 * Strict "is development?" check used to gate sensitive output (error
 * messages, stack traces) that would otherwise leak in production.
 *
 * Unlike isDev(), this returns true ONLY when NODE_ENV is explicitly set
 * to "development". An unset/empty NODE_ENV is treated as production so an
 * operator who forgets to set it never leaks internals.
 *
 * SECURITY(high): always use this for guarding info-disclosure code paths
 * (server errors → response bodies) rather than isDev().
 */
export declare function isExplicitDev(): boolean;
export declare function requireEnv(key: string): string;
export declare function safeStringify(data: unknown): string;
