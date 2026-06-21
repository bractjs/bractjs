import type { CSSProperties } from "react";

export type ImageFormat = "webp" | "avif" | "jpeg" | "png";
export type ImageFit = "cover" | "contain" | "fill";

export interface ImageProps {
  /** Must be a path under /public/, e.g. /public/hero.jpg */
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: ImageFormat;
  fit?: ImageFit;
  /** Disables lazy loading and sets fetchpriority=high (above-the-fold images). */
  priority?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
}

const WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920];

function imgUrl(src: string, w: number, q: number, format: ImageFormat, fit: ImageFit): string {
  const sp = new URLSearchParams({
    src,
    w: String(w),
    q: String(q),
    format,
    fit,
  });
  return `/_image?${sp.toString()}`;
}

export function Image({
  src,
  alt,
  width,
  height,
  quality = 80,
  format = "webp",
  fit = "cover",
  priority = false,
  sizes = "100vw",
  className,
  style,
}: ImageProps) {
  // Only include widths up to 1.5× the declared intrinsic width to avoid
  // generating unnecessarily large variants.
  const widths = width
    ? WIDTHS.filter((w) => w <= Math.ceil(width * 1.5))
    : WIDTHS;

  // Ensure at least one srcset entry even if widths filtered to empty.
  const srcWidths = widths.length > 0 ? widths : [width ?? 1280];

  const srcset = srcWidths
    .map((w) => `${imgUrl(src, w, quality, format, fit)} ${w}w`)
    .join(", ");

  const defaultSrc = imgUrl(src, width ?? 1280, quality, format, fit);

  return (
    <img
      src={defaultSrc}
      srcSet={srcset}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      // React 19 prop is camelCase `fetchPriority`; React emits the lowercase
      // `fetchpriority` HTML attribute. Using the lowercase prop here triggers
      // "Invalid DOM property `fetchpriority`" at hydration.
      fetchPriority={priority ? "high" : "auto"}
      sizes={sizes}
      className={className}
      style={style}
    />
  );
}
