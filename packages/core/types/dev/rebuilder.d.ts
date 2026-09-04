import type { BractJSConfig } from "../server/serve.ts";
export declare function rebuildClient(config?: Partial<BractJSConfig>): Promise<{
    duration: number;
}>;
