import type { BractJSConfig } from "../server/serve.ts";
export interface DevServerOptions {
    /** HTTP port for the app server. Default: config.port ?? 3000. */
    port?: number;
    /** WebSocket port for HMR. Default: 3001. */
    hmrPort?: number;
    /** Merged over values from bractjs.config.ts. */
    config?: Partial<BractJSConfig>;
    /**
     * Skip loading bractjs.config.ts from cwd.
     * Useful when the caller supplies the full config via the `config` option.
     */
    skipUserConfig?: boolean;
    /**
     * Called when a change lands that the running process cannot absorb —
     * `app/server.ts`, `lifecycle.ts`, any `*.server.ts`, a shared non-route
     * module, or an added/removed route file. `bractjs dev` passes a callback
     * that exits with a reserved code so its supervisor respawns the server;
     * the default (programmatic use) logs a prominent restart warning and the
     * dev loop continues with the previous server-side code.
     */
    onRestartRequired?: (file: string) => void;
}
export interface DevServer {
    stop(): void;
}
/**
 * A dev-server startup failure with a user-actionable message (e.g. a port
 * conflict). The CLI prints `message` without a stack and exits non-zero;
 * programmatic callers can catch it and react — createDevServer never calls
 * `process.exit()` itself.
 */
export declare class DevServerError extends Error {
    readonly code?: string | undefined;
    constructor(message: string, code?: string | undefined);
}
export declare function createDevServer(options?: DevServerOptions): Promise<DevServer>;
