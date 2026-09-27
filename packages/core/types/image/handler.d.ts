/** Nearest step on {@link QUALITY_STEPS} (ties round up). */
export declare function snapQuality(q: number): number;
export declare function handleImageRequest(request: Request, publicDir: string, cacheDir: string): Promise<Response | null>;
