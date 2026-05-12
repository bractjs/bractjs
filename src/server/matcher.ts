import type { RouteFile, Segment } from "./scanner.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TrieNode {
  children: Map<string, TrieNode>;
  paramChild?: { name: string; node: TrieNode };
  catchAllChild?: { name: string; node: TrieNode };
  routeFile?: RouteFile;
}

export type MatchResult = {
  routeFile: RouteFile;
  params: Record<string, string>;
} | null;

// ── Build ──────────────────────────────────────────────────────────────────

function makeNode(): TrieNode {
  return { children: new Map() };
}

export function buildTrie(routes: RouteFile[]): TrieNode {
  const root = makeNode();

  for (const route of routes) {
    let node = root;

    for (const seg of route.segments) {
      if (typeof seg === "string") {
        if (!node.children.has(seg)) node.children.set(seg, makeNode());
        node = node.children.get(seg)!;
      } else if ("param" in seg) {
        if (!node.paramChild) node.paramChild = { name: seg.param, node: makeNode() };
        node = node.paramChild.node;
      } else {
        // catchAll — terminal, store and stop
        if (!node.catchAllChild) node.catchAllChild = { name: seg.catchAll, node: makeNode() };
        node = node.catchAllChild.node;
        break;
      }
    }

    node.routeFile = route;
  }

  return root;
}

// ── Match ──────────────────────────────────────────────────────────────────

export function matchRoute(pathname: string, trie: TrieNode): MatchResult {
  const parts = pathname.split("/").filter(Boolean);
  return walk(trie, parts, 0, {});
}

function walk(
  node: TrieNode,
  parts: string[],
  idx: number,
  params: Record<string, string>
): MatchResult {
  // All parts consumed — check for route at this node
  if (idx === parts.length) {
    return node.routeFile ? { routeFile: node.routeFile, params } : null;
  }

  const part = parts[idx];

  // 1. Prefer static match
  const staticChild = node.children.get(part);
  if (staticChild) {
    const result = walk(staticChild, parts, idx + 1, params);
    if (result) return result;
  }

  // 2. Try param match
  if (node.paramChild) {
    const result = walk(node.paramChild.node, parts, idx + 1, {
      ...params,
      [node.paramChild.name]: part,
    });
    if (result) return result;
  }

  // 3. Try catch-all — consumes remaining segments
  if (node.catchAllChild) {
    const remaining = parts.slice(idx).join("/");
    const catchNode = node.catchAllChild.node;
    if (catchNode.routeFile) {
      return {
        routeFile: catchNode.routeFile,
        params: { ...params, [node.catchAllChild.name]: remaining },
      };
    }
  }

  return null;
}
