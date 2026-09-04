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
export declare function Image({ src, alt, width, height, quality, format, fit, priority, sizes, className, style, }: ImageProps): import("react").JSX.Element;
