export type ImageFormat = "webp" | "avif" | "jpeg" | "png";
export type ImageFit = "cover" | "contain" | "fill";
export interface ImageTransformParams {
    w?: number;
    h?: number;
    q: number;
    format: ImageFormat;
    fit: ImageFit;
}
export interface TransformResult {
    data: ArrayBuffer;
    contentType: string;
    format: ImageFormat;
}
export declare const QUALITY_DEFAULT = 80;
export declare const FORMAT_DEFAULT: ImageFormat;
export declare const FIT_DEFAULT: ImageFit;
export declare const BREAKPOINTS: number[];
export declare const MIME: Record<ImageFormat, string>;
export declare const ALLOWED_FITS: ReadonlySet<ImageFit>;
