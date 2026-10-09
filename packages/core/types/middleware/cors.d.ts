import type { MiddlewareFn } from "../server/middleware.ts";
export interface CorsOptions {
    origin: string | string[];
    methods?: string[];
    credentials?: boolean;
}
export declare function cors(options: CorsOptions): MiddlewareFn;
