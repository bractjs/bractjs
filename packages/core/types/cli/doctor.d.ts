/** The oldest Bun the framework is tested on (CI's matrix floor). */
export declare const MIN_BUN = "1.4.2";
export type CheckStatus = "ok" | "warn" | "fail";
export interface CheckResult {
    name: string;
    status: CheckStatus;
    detail: string;
    /** What to do about a warn/fail. */
    fix?: string;
}
export declare function checkBunVersion(version?: string, min?: string): CheckResult;
export declare function checkAppLayout(appDir: string, cwd?: string): CheckResult;
/**
 * Two copies of React (one for the app, one for the framework) make hydration
 * fail with "Invalid hook call" — usually a stale lockfile or a mismatched
 * version. Resolve react as the app and as the framework see it, and compare.
 */
export declare function checkReactCopies(cwd?: string): CheckResult;
export declare function checkConfig(load: () => Promise<unknown>): Promise<CheckResult>;
export declare function checkGeneratedTypes(appDir: string): Promise<CheckResult>;
export declare function checkEnv(appDir: string): Promise<CheckResult>;
export declare function checkMdx(appDir: string, cwd?: string): CheckResult;
export declare function checkPort(port: number, host?: string): Promise<CheckResult>;
export declare function formatDoctor(results: CheckResult[]): string;
