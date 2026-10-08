import type { BractJSConfig } from "../server/serve.ts";
/**
 * Run `run(batch)` one at a time. A batch scheduled while a run is in flight
 * is merged (via `merge`) with any other waiting batch and runs exactly once
 * after it — never concurrently. Two overlapping client rebuilds `rm` each
 * other's output directory, delete the shared entry shim mid-build and
 * interleave manifest writes. A failing run is logged; later batches still run.
 * The returned promise settles when the queue has drained.
 */
export declare function serializeRebuilds<T>(run: (batch: T) => Promise<void>, merge: (queued: T, next: T) => T): (batch: T) => Promise<void>;
export interface RebuildResult {
    duration: number;
    /** Route pattern → its chunk URL (e.g. "blog/[id]" → "/build/client/app/routes/blog/[id].js"). Empty when the build failed. */
    routeChunks: Map<string, string>;
}
export declare function rebuildClient(config?: Partial<BractJSConfig>): Promise<RebuildResult>;
