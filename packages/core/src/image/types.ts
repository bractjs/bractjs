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

export const QUALITY_DEFAULT = 80;
export const FORMAT_DEFAULT: ImageFormat = "webp";
export const FIT_DEFAULT: ImageFit = "cover";
export const BREAKPOINTS = [320, 640, 768, 1024, 1280, 1536, 1920];
export const MIME: Record<ImageFormat, string> = {
  webp: "image/webp",
  avif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
};
export const ALLOWED_FITS: ReadonlySet<ImageFit> = new Set(["cover", "contain", "fill"]);
