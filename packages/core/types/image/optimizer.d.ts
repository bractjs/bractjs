import type { ImageTransformParams, TransformResult } from "./types.ts";
export declare function buildArgs(binary: string, input: string, params: ImageTransformParams): string[];
export declare function transformImage(filePath: string, params: ImageTransformParams): Promise<TransformResult>;
