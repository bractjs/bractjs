/** One frame of an error stack. */
export interface StackFrame {
    /** Function name, when the engine gives one. */
    fn?: string;
    /** A file path or URL, without any `?query`. */
    file: string;
    /** 1-based. */
    line: number;
    /** 1-based. */
    column: number;
}
/** Parse an `Error.stack` string into frames (unparseable lines are skipped). */
export declare function parseStack(stack: string): StackFrame[];
