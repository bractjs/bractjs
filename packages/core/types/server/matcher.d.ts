import type { RouteFile } from "./scanner.ts";
export interface TrieNode {
    children: Map<string, TrieNode>;
    paramChild?: {
        name: string;
        node: TrieNode;
    };
    /**
     * An optional param segment (`[[id]]`). When present it behaves like a param
     * child (binds `name` to the consumed part); the matcher additionally tries
     * skipping it entirely, so the route at `node` matches with the segment
     * absent too (the param is then simply not set).
     */
    optionalChild?: {
        name: string;
        node: TrieNode;
    };
    catchAllChild?: {
        name: string;
        node: TrieNode;
    };
    routeFile?: RouteFile;
}
export type MatchResult = {
    routeFile: RouteFile;
    params: Record<string, string>;
} | null;
export declare function buildTrie(routes: RouteFile[]): TrieNode;
export declare function matchRoute(pathname: string, trie: TrieNode): MatchResult;
