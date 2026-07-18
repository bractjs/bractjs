import type { ImageTransformParams, TransformResult } from "./types.ts";
export declare function getFromMemory(src: string, params: ImageTransformParams): Promise<TransformResult | null>;
export declare function setInMemory(src: string, params: ImageTransformParams, result: TransformResult): Promise<void>;
export declare function getFromDisk(dir: string, src: string, params: ImageTransformParams): Promise<TransformResult | null>;
export declare function setOnDisk(dir: string, src: string, params: ImageTransformParams, result: TransformResult): Promise<void>;
