import { type ComponentType, type ReactElement, type ReactNode } from "react";
import type { ServerManifest } from "../server/render.ts";
import type { I18nConfig } from "./i18n.ts";
export interface RootErrorDocumentProps {
    /** root.tsx's ErrorBoundary, else the built-in fallback. */
    Boundary: ComponentType<{
        error: unknown;
    }>;
    /** root.tsx's `Layout` export: when present, it renders the document around the boundary. */
    Layout?: ComponentType<{
        children?: ReactNode;
    }>;
    error: Error;
    status: number;
    params: Record<string, string>;
    pathname: string;
    search: string;
    manifest: ServerManifest;
    requestId?: string;
    locale?: string;
    i18n?: I18nConfig;
}
/**
 * The document for a failed root loader: root.tsx's `Layout` (or a minimal
 * `<html>`) around root's ErrorBoundary, with the app-wide stylesheets. The
 * server renders it and the client hydrates the SAME tree (client/entry.tsx),
 * so the page is interactive. There is no router behind it: the root loader
 * failed, so `/_data` would fail too, and links are plain document loads that
 * try the app again.
 */
export declare function RootErrorDocument(props: RootErrorDocumentProps): ReactElement;
