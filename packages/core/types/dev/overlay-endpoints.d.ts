export interface OverlayEndpointOptions {
    /** The project root (cwd): nothing outside it is read or opened. */
    root: string;
    /** The dev client build directory (`build/client`), for mapping browser frames. */
    clientOutDir: string;
}
export interface OverlayFrame {
    fn?: string;
    /** Path relative to the project root. */
    file: string;
    line: number;
    column: number;
    /** In the app (not node_modules or the framework). */
    app: boolean;
    /** Up to 3 lines either side of `line`. */
    excerpt: Array<{
        line: number;
        text: string;
    }>;
}
/**
 * The line of `original` holding the same code as line `line` of `rewritten`
 * (compared trimmed), nearest to `line` when it occurs more than once; null
 * when it doesn't occur or is too generic to place (blank, a lone brace).
 */
export declare function relocate(rewritten: string, original: string, line: number): number | null;
export declare function framesForStack(stack: string, opts: OverlayEndpointOptions): OverlayFrame[];
export declare function handleStackRequest(request: Request, opts: OverlayEndpointOptions): Promise<Response>;
/**
 * argv to open `file` at `line`:`column` with `editor`: a command name or
 * path, optionally with flags (`EDITOR="code --wait"` is common). A value
 * that is an existing path is one command, even with spaces in it.
 */
export declare function editorArgs(editor: string, file: string, line: number, column: number): string[];
/** `BRACTJS_EDITOR`, else `VISUAL`, else `EDITOR`, else VS Code's `code`. */
export declare function chosenEditor(env?: Record<string, string | undefined>): string;
export declare function handleOpenRequest(request: Request, opts: OverlayEndpointOptions, launch?: (argv: string[]) => void): Promise<Response>;
