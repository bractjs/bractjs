# BractJS — Build Prompts

> Ordered prompt sequence to build the framework from scratch.
> Each prompt is self-contained. Run them in order.
> Rule applied to every prompt: keep files under 150 lines. Split if needed.

---

## MASTER CONTEXT BLOCK
> Paste this at the top of every new conversation session.

```
You are building "BractJS" — a production-grade SSR framework on Bun.sh + React 19.
Constraints:
- Runtime: Bun only. Dependencies: react, react-dom only.
- No Vite, Webpack, Express, Hono, React Router.
- Bun APIs only: Bun.serve, Bun.build, Bun.file, Bun.Glob, Bun.watch
- TypeScript + TSX throughout.
- Max 150 lines per file. Split into helpers if needed.
- After every prompt: update ROADMAP.md (check off completed items).
```

---

## PHASE 0 — Project Scaffold

### Prompt 0.1 — Repo Init + package.json
```
Create the Bract framework repo scaffold.

Files to create:
1. package.json
   - name: "bractjs", version: "0.0.1"
   - bin: { "bractjs": "./bin/cli.ts" }
   - exports: { ".": "./src/index.ts" }
   - peerDependencies: { react: "^19", react-dom: "^19" }
   - devDependencies: { react, react-dom, @types/react, @types/react-dom, @types/bun }
   - scripts: { dev: "bun run src/dev/server.ts", build: "bun run src/build/bundler.ts", test: "bun test" }

2. tsconfig.json
   - target: ESNext, module: ESNext, moduleResolution: bundler
   - jsx: react-jsx, strict: true
   - paths: { "bractjs": ["./src/index.ts"] }

3. .gitignore — node_modules, build/, .env

4. ROADMAP.md — paste this structure:
   ## Phase 0 - Scaffold
   - [x] Repo init
   ## Phase 1a - Static SSR Shell
   - [ ] Bun.serve() entry
   - [ ] renderToReadableStream wrapper
   - [ ] Scripts + LiveReload components
   - [ ] Root layout convention
   ## Phase 1b - Routing + Loaders
   - [ ] scanRoutes() with Bun.Glob
   - [ ] Route trie matcher
   - [ ] Layout chain resolution
   - [ ] Parallel loader execution
   - [ ] defer() helper
   - [ ] /_data endpoint
   - [ ] Action handler
   ## Phase 2 - Client
   - [ ] hydrateRoot entry
   - [ ] RouterContext + NavigationContext
   - [ ] Link component
   - [ ] Form component
   - [ ] Outlet component
   - [ ] useLoaderData / useActionData / useParams / useNavigation
   - [ ] useFetcher
   - [ ] Prefetch on hover
   ## Phase 3 - Dev Experience
   - [ ] Bun.watch() watcher
   - [ ] HMR WebSocket server
   - [ ] HMR browser client
   - [ ] Error overlay (dev)
   - [ ] DefaultErrorBoundary
   - [ ] meta() resolution
   - [ ] Await + Suspense for defer()
   ## Phase 4 - Build System
   - [ ] Dual Bun.build() (server + client)
   - [ ] Route code splitting
   - [ ] Content hash filenames
   - [ ] route-manifest.json generation
   - [ ] .server.ts import guard plugin
   - [ ] clientEnv allowlist
   ## Phase 5 - Polish
   - [ ] Middleware pipeline
   - [ ] requestLogger middleware
   - [ ] cors middleware
   - [ ] authGuard middleware
   - [ ] createCookieSession
   - [ ] CLI: dev / build / start / new
   - [ ] Scaffold template
   - [ ] TypeScript declaration files
   - [ ] README.md

5. README.md — stub:
   # Bract
   > SSR framework for Bun + React 19
   ## Status: In Development

No implementation code yet. Scaffold only.
```

---

## PHASE 1a — Static SSR Shell

### Prompt 1.1 — Shared Types
```
Create Bract shared type definitions. No implementation, types only.

Files:
1. src/shared/route-types.ts
   - LoaderArgs: { request: Request, params: Record<string,string>, context: Record<string,unknown> }
   - ActionArgs: LoaderArgs & { formData: FormData }
   - MetaDescriptor: { title?: string, name?: string, property?: string, content?: string }
   - MetaArgs<T>: { loaderData: T, params: Record<string,string> }
   - RouteModule interface: all optional exports (loader, action, meta, ErrorBoundary, handle, default)

2. src/shared/errors.ts
   - BractError class (extends Error, adds status: number)
   - HttpError class (extends BractError)
   - isRedirect(value): boolean — checks instanceof Response && status 3xx
   - isHttpError(value): boolean

3. src/shared/deferred.ts
   - Deferred<T> class: wraps a Promise, has .promise property, isDeferred() typeguard
   - defer<T>(data: Record<string, T | Promise<T>>): object that marks promises as deferred

Keep each file under 60 lines.
Update ROADMAP.md: no checkboxes yet, these are prereqs.
```

### Prompt 1.2 — Context + Response Helpers
```
Create Bract context and response utilities.

Files:
1. src/shared/context.ts
   - BractContextValue interface: { loaderData, actionData, params, pathname, manifest }
   - BractContext = createContext<BractContextValue>(null!)
   - BractProvider component: wraps children with context value

2. src/server/response.ts
   - redirect(url: string, status = 302): Response
   - json<T>(data: T, init?: ResponseInit): Response  
   - error(message: string, status = 500): Response
   - All functions under 10 lines each

3. src/server/env.ts
   - isDev(): boolean — checks Bun.env.NODE_ENV !== "production"
   - requireEnv(key: string): string — throws if missing
   - safeStringify(data: unknown): string — JSON.stringify with circular ref guard

Max 50 lines per file.
```

### Prompt 1.3 — Render Pipeline
```
Create the SSR render wrapper.

File: src/server/render.ts

Function: renderRoute(options: RenderOptions): Promise<Response>

RenderOptions:
- shell: React.ReactNode
- loaderData: Record<string, unknown>
- actionData: unknown
- params: Record<string, string>
- pathname: string
- manifest: RouteManifest (stub: { clientEntry: string, routes: {} })
- meta: MetaDescriptor[]
- status?: number

Steps inside renderRoute():
1. Build inline script: window.__BRACT_DATA__ = JSON.stringify({loaderData, actionData, params, pathname})
2. Call renderToReadableStream(shell, { bootstrapScriptContent, bootstrapScripts: [manifest.clientEntry], onError })
3. Return new Response(stream, { status, headers: { Content-Type: text/html, Transfer-Encoding: chunked } })

Import renderToReadableStream from "react-dom/server".
Keep under 80 lines. Export RenderOptions type.
```

### Prompt 1.4 — Scripts + LiveReload Components
```
Create client components that root.tsx uses to inject scripts.

Files:
1. src/client/components/Scripts.tsx
   - Reads BractContext.manifest
   - Renders <script type="module" src={manifest.clientEntry} /> 
   - Also renders route chunk preload <link rel="modulepreload"> for current route
   - Returns null during SSR (typeof window check not needed — Bract injects via bootstrapScripts)
   - Actually: renders nothing at runtime, Bract injects via bootstrapScriptContent
   - So Scripts is a marker component — server detects it in tree and injects there
   - Simplest impl: return null, document this behavior

2. src/client/components/LiveReload.tsx
   - In production (process.env.NODE_ENV === "production"): return null
   - In dev: renders <script dangerouslySetInnerHTML with WebSocket client code that:
     * Connects to ws://localhost:3001
     * On message { type: "hmr" }: calls location.reload()
     * Reconnects on close with 1s delay

3. src/client/components/Outlet.tsx
   - Stub for now: reads BractContext, renders null
   - Will be replaced in Phase 2

Max 60 lines each.
```

### Prompt 1.5 — Static Bun.serve() Entry
```
Create the development server entry point with a hardcoded route to prove the pipeline.

Files:
1. src/server/serve.ts
   - createServer(config?: Partial<BractConfig>): { server: Server, stop(): void }
   - Calls Bun.serve({ port: config.port ?? 3000, fetch: handleRequest })
   - handleRequest: returns renderRoute() with a hardcoded shell for now
   - Shell: <html><head></head><body><h1>Bract Works</h1></body></html>
   - loaderData: {}, params: {}, pathname: "/"
   - manifest stub: { clientEntry: "/build/client/client.js", routes: {} }

2. src/server/index.ts — re-exports createServer, redirect, json, error

3. src/index.ts — main package entry, re-exports everything public

4. app/root.tsx (template/example, not framework code)
   - Simple root that uses Scripts and LiveReload
   - Include comment: "This is a user file, not framework source"

Run test: bun run src/server/serve.ts
Expected: server starts on 3000, curl returns HTML with "Bract Works".

Update ROADMAP.md:
- [x] Bun.serve() entry
- [x] renderToReadableStream wrapper
- [x] Scripts + LiveReload components
- [x] Root layout convention
```

---

## PHASE 1b — Routing + Loaders

### Prompt 1.6 — Route Scanner
```
Create the file-based route scanner.

File: src/server/scanner.ts

Types:
- RouteFile: { filePath: string, urlPattern: string, segments: Segment[] }
- Segment: string | { param: string } | { catchAll: string }

Functions:
1. scanRoutes(appDir: string): Promise<RouteFile[]>
   - Use: new Bun.Glob("routes/**/*.{tsx,ts}").scan(appDir)
   - Filter out layout.tsx files (handled separately)
   - Convert file path to URL pattern:
     * _index.tsx → ""  (index route)
     * [id].tsx → :id
     * [...slug].tsx → *
     * about.tsx → about
   - Sort: static before dynamic before catch-all (by segment score)

2. filePathToPattern(filePath: string): string
   - Pure function, no I/O
   - Strip "routes/" prefix and ".tsx" suffix
   - Handle _index specially

3. pathToSegments(pattern: string): Segment[]
   - Splits on "/" and classifies each segment

Write unit tests inline using Bun's test:
  import { test, expect } from "bun:test"
  test("converts [id] to param segment", ...)
  test("_index maps to empty pattern", ...)

Max 120 lines including tests.
Update ROADMAP.md: [x] scanRoutes() with Bun.Glob
```

### Prompt 1.7 — Route Trie Matcher
```
Create the route matching trie. No regex, no external deps.

File: src/server/matcher.ts

Types:
- TrieNode: { children: Map<string, TrieNode>, paramChild?, catchAllChild?, routeFile? }
- MatchResult: { routeFile: RouteFile, params: Record<string,string> } | null

Functions:
1. buildTrie(routes: RouteFile[]): TrieNode
   - Insert each RouteFile into the trie by its segments
   - Static segments → children map
   - Param segments → paramChild
   - CatchAll segments → catchAllChild

2. matchRoute(pathname: string, trie: TrieNode): MatchResult
   - Split pathname on "/"
   - Walk trie, prefer static > param > catchAll at each step
   - Collect params as walking
   - Return null if no match

Unit tests (inline):
  test("matches exact static /about")
  test("matches /blog/42 with params.id = '42'")
  test("prefers /blog/new over /blog/[id]")
  test("matches /docs/a/b/c as catch-all")
  test("returns null for unmatched")

Max 130 lines.
Update ROADMAP.md: [x] Route trie matcher
```

### Prompt 1.8 — Layout Chain Resolver
```
Create layout chain resolution — given a matched route, find its full ancestor chain.

File: src/server/layout.ts

Types:
- LayoutChain: { root: RouteModule, layouts: RouteModule[], route: RouteModule }
- ResolvedRoute: RouteFile & { layoutFiles: string[] }

Functions:
1. resolveLayoutChain(routeFile: RouteFile, appDir: string): Promise<ResolvedRoute>
   - For route "blog/[id]", check for:
     * appDir/root.tsx (always)
     * appDir/routes/blog/layout.tsx (if exists)
   - Use Bun.file(path).exists() to check
   - Return ordered array: [root, ...layouts, route]

2. importRouteModule(filePath: string): Promise<RouteModule>
   - Dynamic import of the file
   - Returns the module with all optional exports normalized to undefined if missing

3. resolveRouteChain(routeFile: RouteFile, appDir: string): Promise<LayoutChain>
   - Calls resolveLayoutChain + importRouteModule for each file
   - Returns { root, layouts, route }

Max 80 lines.
Update ROADMAP.md: [x] Layout chain resolution
```

### Prompt 1.9 — Parallel Loader Execution
```
Create the loader runner with parallel execution and error isolation.

File: src/server/loader.ts

Functions:
1. safeRun<T>(fn: (() => Promise<T>) | undefined): Promise<T | { __error: unknown } | null>
   - If fn is undefined: return null
   - Try/await fn()
   - If throws redirect/HttpError: re-throw
   - Otherwise: return { __error: err }

2. runLoaders(chain: LayoutChain, args: LoaderArgs): Promise<LoaderResults>
   - LoaderResults: { root, layout, route } — each is data or { __error } or null
   - Promise.all([safeRun(root.loader), safeRun(layout?.loader), safeRun(route.loader)])
   - All receive the same args object

3. runAction(routeModule: RouteModule, args: ActionArgs): Promise<unknown>
   - If no action export: return null
   - Await routeModule.action(args)
   - Re-throws redirect, wraps other errors

4. buildLoaderArgs(request: Request, params: Record<string,string>, context: Record<string,unknown>): LoaderArgs

Max 90 lines.
Update ROADMAP.md: [x] Parallel loader execution
```

### Prompt 1.10 — defer() + Await Component
```
Implement defer() for streaming slow data and the Await component.

Files:
1. src/shared/deferred.ts (expand previous stub)
   - DeferredData<T>: wraps { [key]: Promise<T> | T }
   - defer<T>(data: Record<string, T | Promise<T>>): DeferredData<T>
   - isDeferred(value): value is DeferredData
   - stripDeferred(data: DeferredData): Record<string, T> — returns only resolved values
   - promisesOf(data: DeferredData): Record<string, Promise<T>> — returns only promises

2. src/client/components/Await.tsx
   - Props: { resolve: Promise<T>, fallback: ReactNode, children: (data: T) => ReactNode }
   - Use React.use(promise) — React 19 API
   - Wrap parent in <Suspense fallback={fallback}>
   - Note: React.use() unwraps the promise; Suspense handles the pending state

Max 70 lines total.
Update ROADMAP.md: [x] defer() helper
```

### Prompt 1.11 — /_data Endpoint + Wire Router
```
Wire the router into Bun.serve() and add the /_data soft-nav endpoint.

Modify: src/server/serve.ts (expand from Prompt 1.5)

New handleRequest logic:
1. pathname = new URL(request.url).pathname

2. If pathname starts with "/_data":
   - targetPath = searchParams.get("path")
   - Match route for targetPath
   - Run loaders (GET only)
   - Return json({ root, layout, route })

3. If pathname starts with "/public/":
   - Return Bun.file(publicDir + pathname) response

4. Match route via matchRoute(pathname, trie)
   - If no match: return error("Not Found", 404)

5. If POST/PUT/DELETE: runAction first, handle redirect

6. runLoaders → renderRoute with resolved shell

New file: src/server/request-handler.ts
   - handleRequest(request, config, trie, appDir): Promise<Response>
   - Extracted from serve.ts to keep serve.ts under 60 lines

Update ROADMAP.md:
- [x] /_data endpoint
- [x] Action handler
```

---

## PHASE 2 — Client Hydration + Navigation

### Prompt 2.1 — RouterContext + NavigationContext
```
Create the two core client contexts.

Files:
1. src/client/router.tsx
   - RouterContextValue: { loaderData, actionData, params, pathname, manifest, setRoute }
   - RouterContext = createContext<RouterContextValue>(null!)
   - NavigationState: "idle" | "loading" | "submitting"
   - NavigationContextValue: { state, navigate, submit }
   - NavigationContext = createContext<NavigationContextValue>(null!)

2. src/client/ClientRouter.tsx
   - ClientRouter({ children, initialData }): JSX.Element
   - initialData comes from window.__BRACT_DATA__
   - Manages useState for { loaderData, actionData, params, pathname }
   - Manages useState for navigationState
   - navigate(to: string): async function (stub for now — just sets state)
   - Provides both contexts

Keep each file under 80 lines.
```

### Prompt 2.2 — Client Entry + hydrateRoot
```
Create the browser entry point.

File: src/client/entry.tsx
- Read window.__BRACT_DATA__ (typed, not any)
- Import ClientRouter
- Import Outlet (stub)
- Call hydrateRoot(document, <ClientRouter initialData={data}><App /></ClientRouter>)
- App: renders <Outlet /> inside root structure

File: src/client/types.ts
- BractClientData: { loaderData, actionData, params, pathname, manifest }
- Extend Window interface: __BRACT_DATA__: BractClientData

Max 50 lines each.
```

### Prompt 2.3 — useLoaderData + useActionData + useParams + useNavigation
```
Create the four primary hooks.

File: src/client/hooks/useLoaderData.ts
- useLoaderData<T = unknown>(): T
- Reads RouterContext.loaderData.route
- Throws if used outside RouterContext

File: src/client/hooks/useActionData.ts  
- useActionData<T = unknown>(): T | null
- Reads RouterContext.actionData

File: src/client/hooks/useParams.ts
- useParams(): Record<string, string>
- Reads RouterContext.params

File: src/client/hooks/useNavigation.ts
- useNavigation(): { state: NavigationState }
- Reads NavigationContext

Each file: max 20 lines. Dead simple.
```

### Prompt 2.4 — Navigation Logic (navigate function)
```
Implement the real navigate() function in ClientRouter.

Modify: src/client/ClientRouter.tsx

navigate(to: string):
1. setNavigationState("loading")
2. const chunkUrl = manifest.routes[matchPatternForPath(to)]?.chunk
3. const [routeModule, data] = await Promise.all([
     chunkUrl ? import(chunkUrl) : Promise.resolve(null),
     fetch(`/_data?path=${to}`).then(r => r.json())
   ])
4. startTransition(() => {
     setLoaderData(data)
     setParams(data.params)
     setPathname(to)
     setCurrentModule(routeModule)
   })
5. setNavigationState("idle")
6. history.pushState({}, "", to)
7. Update document.title from data meta

New file: src/client/nav-utils.ts
- matchPatternForPath(pathname: string, manifest: RouteManifest): string | null
- Simple: iterate manifest.routes keys, find matching pattern
- Reuses same segment-matching logic — but client-side, against manifest keys

Handle popstate event (browser back): add listener in ClientRouter useEffect.

Max 100 lines total across both files.
```

### Prompt 2.5 — Link Component
```
Create the <Link> component.

File: src/client/components/Link.tsx

Props: { to: string, prefetch?: "hover" | "none", children, className?, ...rest }

Behavior:
1. onClick: preventDefault, call navigate(to)
2. onMouseEnter (if prefetch="hover"): call prefetchRoute(to)
3. Render: <a href={to} onClick onMouseEnter {...rest}>{children}</a>
4. Use useNavigation() to add aria-disabled during loading

File: src/client/prefetch.ts
- prefetchRoute(path: string, manifest: RouteManifest): void
- Prefetches chunk via <link rel="modulepreload"> injection
- Prefetches loader data via fetch(/_data?path=) with low priority
- Cache: Set<string> to avoid duplicate prefetches

Max 60 lines each.
```

### Prompt 2.6 — Form Component
```
Create the <Form> component.

File: src/client/components/Form.tsx

Props: { method?: "post"|"put"|"delete", action?: string, children, ...rest }

Behavior:
1. onSubmit: preventDefault
2. setNavigationState("submitting")
3. formData = new FormData(e.currentTarget)
4. response = await fetch(action ?? currentPathname, { method, body: formData })
5. If response.redirected: navigate(response.url)
6. Else: actionData = await response.json(), re-run loaders for current route
7. setNavigationState("idle")

Helper: src/client/form-utils.ts
- reloadLoaders(pathname, setLoaderData): Promise<void>
- Fetches /_data?path=pathname, updates context

Max 80 lines total.
```

### Prompt 2.7 — Outlet + Lazy Route Rendering
```
Implement Outlet with lazy route loading.

File: src/client/components/Outlet.tsx

- Reads RouterContext for currentModule (the lazy-loaded route module default export)
- If no currentModule: render null with Suspense fallback
- Wrap in React error boundary using route's ErrorBoundary export

File: src/client/route-cache.ts
- routeCache: Map<string, React.LazyExoticComponent>
- getLazyRoute(chunkUrl: string): React.LazyExoticComponent
- Uses React.lazy(() => import(chunkUrl))
- Caches by chunkUrl to avoid re-creating lazy components

Max 70 lines total.
```

### Prompt 2.8 — useFetcher Hook
```
Create useFetcher() for background fetches without navigation.

File: src/client/hooks/useFetcher.ts

Return type: {
  data: unknown,
  state: "idle" | "loading" | "submitting",
  load(path: string): Promise<void>,
  submit(path: string, opts: { method: string, body: FormData | Record<string,string> }): Promise<void>
}

Implementation:
- Local useState for { data, state } — does NOT touch NavigationContext
- load(): fetch(/_data?path=), sets data to result.route
- submit(): fetch(path, { method, body }), sets data to response json
- Each fetcher is independent — multiple can run concurrently

Max 60 lines.
Update ROADMAP.md: all Phase 2 items checked.
```

---

## PHASE 3 — Dev Experience

### Prompt 3.1 — Bun.watch() File Watcher
```
Create the file watcher for dev mode.

File: src/dev/watcher.ts

- watchApp(appDir: string, onChange: (file: string) => void): void
- Uses Bun.watch(appDir, { recursive: true })
- Filters: only .tsx, .ts, .css files
- Debounce: 50ms (clear timeout on rapid changes)
- Logs: "✓ [filename] changed" to console

File: src/dev/rebuilder.ts
- rebuildClient(config): Promise<{ duration: number }>
- Calls Bun.build() for client bundle (config from Phase 4 — stub for now with no-op)
- Returns { duration: Date.now() - start }
- Re-scans routes after rebuild

Max 60 lines each.
Update ROADMAP.md: [x] Bun.watch() watcher
```

### Prompt 3.2 — HMR WebSocket Server
```
Create the HMR WebSocket server.

File: src/dev/hmr-server.ts

- createHmrServer(port = 3001): { broadcast(msg: object): void, stop(): void }
- Uses Bun.serve() with websocket handler
- Stores connected clients: Set<ServerWebSocket>
- On open: add to set. On close: remove from set.
- broadcast({ type, file, duration }): sends JSON.stringify to all clients
- Prints: "HMR server on ws://localhost:{port}"

File: src/dev/hmr-client.ts (browser-side, embedded as string)
- Export hmrClientScript: string
- Content: connects to ws://localhost:3001, on "hmr" message calls location.reload()
- Reconnects on close after 1000ms

LiveReload.tsx (from Prompt 1.4): update to use hmrClientScript string.

Max 70 lines each.
Update ROADMAP.md: [x] HMR WebSocket server, [x] HMR browser client
```

### Prompt 3.3 — Error Boundaries + DefaultErrorBoundary
```
Create consistent error boundary system.

File: src/shared/errors.ts (expand)
- DefaultErrorBoundary({ error }: { error: Error }): JSX.Element
  * isDev(): show error.message + error.stack in <pre> + copy button
  * isProd(): show "Something went wrong" + requestId prop
- RouteErrorBoundary class component:
  * state: { error: Error | null }
  * static getDerivedStateFromError(error): { error }
  * render: if error → <ErrorComponent error={error} /> else children
  * Props: { errorBoundary?: ComponentType, children }

File: src/dev/error-overlay.ts
- errorOverlayScript: string (browser-injected script)
- Listens for window.__BRACT_ERROR__ and shows full-screen error overlay
- Overlay: fixed position, dark bg, red border, shows message + stack

Update render.ts: inject errorOverlayScript in dev mode via bootstrapScriptContent.

Max 100 lines total.
Update ROADMAP.md: [x] DefaultErrorBoundary, [x] Error overlay (dev)
```

### Prompt 3.4 — meta() Resolution
```
Implement full meta() merge and SSR injection.

File: src/server/meta.ts

Functions:
1. resolveMeta(chain: LayoutChain, loaderData: LoaderResults, params: Params): MetaDescriptor[]
   - Call each module's meta() if present: [root.meta, ...layouts.meta, route.meta]
   - Each receives its own loaderData slice + params
   - Concat all arrays

2. mergeMeta(descriptors: MetaDescriptor[]): MetaDescriptor[]
   - Deduplicate: for descriptors with same `name` or `property`, last wins
   - Title: last { title } descriptor wins
   - Keep all unique descriptors

3. renderMetaTags(descriptors: MetaDescriptor[]): string
   - Returns HTML string of <title> and <meta> tags for SSR injection
   - <title>: from { title } descriptor
   - <meta name>: from { name, content }
   - <meta property>: from { property, content }

Update render.ts to call resolveMeta + inject renderMetaTags into HTML head.

Max 80 lines.
Update ROADMAP.md: [x] meta() resolution
```

### Prompt 3.5 — Wire Dev Server + HMR Together
```
Create the unified dev server entry.

File: src/dev/server.ts
- Imports: createServer, createHmrServer, watchApp, rebuildClient
- Steps:
  1. createHmrServer(3001)
  2. createServer({ port: 3000, dev: true })
  3. watchApp("./app", async (file) => {
       const { duration } = await rebuildClient()
       hmr.broadcast({ type: "hmr", file, duration })
       console.log(`✓ ${file} rebuilt in ${duration}ms`)
     })
  4. console.log("Bract dev server on http://localhost:3000")

Update bin/cli.ts:
- parse argv[2]: "dev" → import("./src/dev/server.ts")
- Stub "build" and "start" for Phase 4

Max 50 lines for server.ts.
Update ROADMAP.md: all Phase 3 items checked.
```

---

## PHASE 4 — Build System

### Prompt 4.1 — Content Hash Utility
```
Create deterministic content hashing for cache busting.

File: src/build/hash.ts
- contentHash(filePath: string): Promise<string>
  * Read file with Bun.file(filePath).arrayBuffer()
  * crypto.subtle.digest("SHA-256", buffer)
  * Return first 8 hex chars of result
- hashString(content: string): Promise<string>
  * Same but accepts string, encodes to Uint8Array first
- renameWithHash(filePath: string): Promise<string>
  * Reads hash, inserts before extension: client.js → client.abc12345.js
  * Returns new path

Tests (inline bun test):
  test("same content → same hash")
  test("different content → different hash")  
  test("hash is 8 hex chars")

Max 60 lines.
Update ROADMAP.md: [x] Content hash filenames
```

### Prompt 4.2 — Route Manifest Generator
```
Create the build manifest generator.

File: src/build/manifest.ts

Types:
- RouteManifest: { version: 1, clientEntry: string, routes: Record<string, RouteManifestEntry> }
- RouteManifestEntry: { chunk: string, pattern: string }

Functions:
1. generateManifest(opts: { clientEntry: string, routeChunks: Map<string, string> }): RouteManifest
   - clientEntry: hashed path to main client bundle
   - routeChunks: Map<urlPattern, hashedChunkPath>

2. writeManifest(manifest: RouteManifest, outDir: string): Promise<void>
   - Writes to {outDir}/route-manifest.json (pretty-printed)

3. loadManifest(buildDir: string): Promise<RouteManifest>
   - Used at runtime by production server
   - Caches result in module scope

Max 60 lines.
Update ROADMAP.md: [x] route-manifest.json generation
```

### Prompt 4.3 — .server.ts Import Guard Plugin
```
Create the Bun.build() plugin that blocks server-only imports in client bundles.

File: src/build/env-plugin.ts

- serverOnlyPlugin: BunPlugin
  * name: "bract-server-only"
  * setup(build): 
    - build.onResolve({ filter: /\.server\.(ts|tsx)$/ }, (args) => {
        throw new Error(
          `[Bract] Cannot import "${args.path}" in client code.\n` +
          `Move this to a loader() or action().`
        )
      })

- clientEnvPlugin(allowedKeys: string[], envValues: Record<string,string>): BunPlugin
  * Replaces process.env.KEY with string literals for allowed keys
  * All other process.env.* become "undefined"

Export both plugins.

Max 50 lines.
Update ROADMAP.md: [x] .server.ts import guard plugin, [x] clientEnv allowlist
```

### Prompt 4.4 — Dual Bun.build() Bundler
```
Create the main build orchestrator.

File: src/build/bundler.ts

Function: runBuild(config: BractConfig): Promise<void>

Steps:
1. scanRoutes to get all route files
2. SERVER BUILD:
   Bun.build({
     entrypoints: ["src/server/index.ts"],
     target: "bun",
     outdir: "build/server",
     sourcemap: config.sourcemap ?? "external",
   })

3. CLIENT BUILD:
   Bun.build({
     entrypoints: ["src/client/entry.tsx", ...routeFilePaths],
     target: "browser",
     splitting: true,
     outdir: "build/client",
     minify: config.minify ?? true,
     sourcemap: config.sourcemap ?? "external",
     define: buildDefines(config),
     plugins: [serverOnlyPlugin, clientEnvPlugin(config.clientEnv ?? [], Bun.env)],
   })

4. Hash all output files, rename them
5. Build manifest from hashed filenames
6. writeManifest to build/

File: src/build/defines.ts
- buildDefines(config): Record<string,string>
- Always includes: "process.env.NODE_ENV": "production"
- Adds config.clientEnv keys

Max 100 lines across both files.
Update ROADMAP.md: [x] Dual Bun.build(), [x] Route code splitting
```

### Prompt 4.5 — Production Server
```
Update the server to load and use the route manifest in production.

Modify: src/server/serve.ts

Production mode (isDev() === false):
- Load manifest with loadManifest(config.buildDir)
- Serve build/client/* with Cache-Control: public, max-age=31536000, immutable
- Serve build/server/* routes from pre-built manifest

Modify: src/server/static.ts (new file)
- serveStatic(pathname: string, buildDir: string): Promise<Response | null>
- If pathname starts with /build/client/: serve with immutable cache headers
- If pathname starts with /public/: serve with no-cache
- Returns null if file not found

Update bin/cli.ts:
- "build" → runBuild(config)
- "start" → createServer({ dev: false }) using production manifest

Max 80 lines total changes.
Update ROADMAP.md: all Phase 4 items checked.
```

---

## PHASE 5 — Polish

### Prompt 5.1 — Middleware Pipeline
```
Implement the middleware system with context threading.

File: src/server/middleware.ts

Types:
- MiddlewareContext: { request: Request, params: Record<string,string>, context: Record<string,unknown> }
- MiddlewareFn: (ctx: MiddlewareContext, next: () => Promise<Response>) => Promise<Response>

Class: MiddlewarePipeline
- fns: MiddlewareFn[]
- use(fn: MiddlewareFn): this — registers middleware
- run(ctx: MiddlewareContext, handler: () => Promise<Response>): Promise<Response>
  * Compose fns into a chain: each calls next() to invoke the next fn
  * Last next() calls handler()

Update request-handler.ts:
- Create MiddlewareContext from request
- Run pipeline before routing
- Pass ctx.context into loader args

Max 70 lines.
Update ROADMAP.md: [x] Middleware pipeline
```

### Prompt 5.2 — Built-in Middleware
```
Create the three built-in middlewares.

File: src/middleware/requestLogger.ts
- Logs: "[METHOD] /path → status in Xms"
- Captures start time before next(), status after
- Max 25 lines

File: src/middleware/cors.ts
- Options: { origin: string | string[], methods?: string[] }
- Sets Access-Control-Allow-* headers
- Handles OPTIONS preflight: return 204
- Max 35 lines

File: src/middleware/authGuard.ts
- Options: { session: SessionStorage, required?: boolean }
- Reads Cookie header → getSession() → sets ctx.context.user
- If required=true and no user: return error("Unauthorized", 401)
- Max 35 lines

Update src/index.ts to export all three.
Update ROADMAP.md: [x] requestLogger, [x] cors, [x] authGuard
```

### Prompt 5.3 — Cookie Session
```
Implement createCookieSession with HMAC-SHA256 signing using Bun's built-in crypto.

File: src/server/session.ts

Types:
- SessionData: Record<string, unknown>
- Session: { get(key), set(key, val), delete(key), has(key) }
- SessionStorage: { getSession(cookie?: string|null): Promise<Session>, commitSession(session, opts?): Promise<string> }

Function: createCookieSession(options: CookieSessionOptions): SessionStorage
- options: { name, secrets: string[], maxAge?, secure?, sameSite? }
- getSession: parse cookie → verify HMAC → deserialize → return Session object
- commitSession: serialize → sign with secrets[0] → build Set-Cookie string

Helpers (private to file):
- sign(data: string, secret: string): Promise<string> — HMAC-SHA256 via crypto.subtle
- verify(data: string, sig: string, secrets: string[]): Promise<boolean> — try each secret
- encode/decode: base64url of JSON

Max 120 lines (this one needs room).
Update ROADMAP.md: [x] createCookieSession
```

### Prompt 5.4 — TypeScript Declaration Files
```
Create the public TypeScript types package.

File: types/route.d.ts
- Export: LoaderArgs, ActionArgs, MetaArgs, MetaDescriptor, RouteModule
- Use generics: RouteModule<TLoader, TAction>

File: types/config.d.ts
- Export: BractConfig interface (all fields from §3d of architecture doc)

File: types/session.d.ts
- Export: Session, SessionStorage, CookieSessionOptions

File: types/middleware.d.ts
- Export: MiddlewareFn, MiddlewareContext

File: types/index.d.ts
- Re-export everything from above

Update package.json:
- "types": "./types/index.d.ts"
- "exports": { ".": { "types": "./types/index.d.ts", "default": "./src/index.ts" } }

Max 40 lines per file.
Update ROADMAP.md: [x] TypeScript declaration files
```

### Prompt 5.5 — CLI: `bract new` Scaffold
```
Create the new-app scaffolding command.

File: bin/cli.ts (expand)
Add "new" command:
1. Parse: bract new <app-name>
2. Create directory <app-name>/
3. Copy templates/new-app/* into it
4. Replace "{{APP_NAME}}" in package.json template with app-name
5. Run: Bun.spawnSync(["bun", "install"], { cwd: appDir })
6. Print success + next steps

File: templates/new-app/package.json
- name: "{{APP_NAME}}", dependencies: { react, react-dom, bract }

File: templates/new-app/bract.config.ts — default config

File: templates/new-app/app/root.tsx — full working root

File: templates/new-app/app/routes/_index.tsx
- Simple homepage with useLoaderData, loader returning { message: "Hello from Bract" }

File: templates/new-app/app/routes/about.tsx — static page

Max 50 lines for cli.ts additions. Template files can be any size (they're user code).
Update ROADMAP.md: [x] CLI commands, [x] Scaffold template
```

### Prompt 5.6 — README + Final Docs
```
Write the production README.md and finalize all docs.

File: README.md — full docs including:
1. Quick start (4 commands: install, new, dev, open browser)
2. File-based routing table (show pattern → URL mapping)
3. Route module API (loader, action, meta, ErrorBoundary, default)
4. Client primitives: Link, Form, Outlet, Scripts, LiveReload
5. Hooks: useLoaderData, useActionData, useParams, useNavigation, useFetcher
6. defer() example with Suspense
7. Middleware usage example
8. createCookieSession example
9. bract.config.ts reference table
10. CLI commands reference
11. Environment variables section (.server.ts convention, clientEnv)

File: ROADMAP.md — mark all items complete, add "Future" section:
- [ ] module-level HMR (no full reload)
- [ ] Edge runtime support
- [ ] Built-in CSS modules
- [ ] Image optimization
- [ ] Typed routes (codegen)

File: CHANGELOG.md — v0.1.0 entry listing all features

Update package.json: bump to "0.1.0"

Update ROADMAP.md: [x] README.md — all Phase 5 complete.
```

---

## CROSS-CUTTING PROMPTS
> Use these any time during development.

### Prompt X.1 — Add Unit Tests for Current Phase
```
Write unit tests for all functions created so far that don't have tests.

Use bun:test. File: src/__tests__/[module-name].test.ts

Rules:
- Test file mirrors source file name
- Test happy path + at least 2 edge cases per function
- No mocking unless absolutely necessary (prefer real Bun.file etc)
- Tests must pass with: bun test

Focus on: router matcher, loader pipeline, meta resolution, content hash, session sign/verify.
```

### Prompt X.2 — File Size Audit
```
Audit all source files in src/ for size violations.

For each file over 150 lines:
1. Identify natural split points (groups of related functions)
2. Extract into a new file named [original]-[concern].ts
3. Update all imports
4. Confirm no file exceeds 150 lines after split

Report: list every file, its line count, and action taken.
```

### Prompt X.3 — Integration Test Suite
```
Create integration tests that start a real Bun.serve() and make fetch() requests.

File: src/__tests__/integration.test.ts

Setup:
- beforeAll: start server on port 3999 (test port)
- afterAll: stop server

Tests:
- GET / returns 200 HTML
- GET /_data?path=/ returns JSON
- POST / runs action
- GET /nonexistent returns 404
- HTML includes window.__BRACT_DATA__
- HTML includes correct <title> from meta()

Use bun:test { test, expect, beforeAll, afterAll }.
```

### Prompt X.4 — Fix TypeScript Errors
```
Run: bun tsc --noEmit

For each TypeScript error:
1. Fix the root cause (not with `any` or `@ts-ignore`)
2. If a type is missing, add it to the appropriate types/ file
3. If a generic is wrong, fix the constraint

Report all fixed errors. Do not change behaviour, only types.
```

### Prompt X.5 — Security Audit
```
Audit the following security concerns in the current codebase:

1. Session cookie: is HMAC verification constant-time? Fix if not.
2. JSON.stringify in bootstrapScriptContent: is it XSS-safe? 
   (Must escape </script> sequences: replace with <\/script>)
3. Static file serving: path traversal attack? 
   (Ensure pathname cannot escape publicDir with ../)
4. .server.ts guard: are there any transitive import paths that bypass it?
5. clientEnv: is there any code path that could leak Bun.env to client?

For each issue found: show the vulnerability, then the fix.
For each non-issue: confirm why it's safe.
```

---

## QUICK REFERENCE

### Prompt Order Summary

```
Phase 0:  0.1
Phase 1a: 1.1 → 1.2 → 1.3 → 1.4 → 1.5
Phase 1b: 1.6 → 1.7 → 1.8 → 1.9 → 1.10 → 1.11
Phase 2:  2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8
Phase 3:  3.1 → 3.2 → 3.3 → 3.4 → 3.5
Phase 4:  4.1 → 4.2 → 4.3 → 4.4 → 4.5
Phase 5:  5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6

Anytime: X.1 (tests), X.2 (size audit), X.3 (integration), X.4 (TS errors), X.5 (security)
```

### Files Per Prompt (total: ~65 files)

| Prompt | Files Created |
|--------|---------------|
| 0.1 | package.json, tsconfig.json, .gitignore, ROADMAP.md, README.md |
| 1.1 | route-types.ts, errors.ts, deferred.ts |
| 1.2 | context.ts, response.ts, env.ts |
| 1.3 | render.ts |
| 1.4 | Scripts.tsx, LiveReload.tsx, Outlet.tsx (stub) |
| 1.5 | serve.ts, server/index.ts, src/index.ts |
| 1.6 | scanner.ts |
| 1.7 | matcher.ts |
| 1.8 | layout.ts |
| 1.9 | loader.ts |
| 1.10 | deferred.ts (expand), Await.tsx |
| 1.11 | request-handler.ts (+ serve.ts update) |
| 2.1 | router.tsx, ClientRouter.tsx |
| 2.2 | entry.tsx, client/types.ts |
| 2.3 | useLoaderData.ts, useActionData.ts, useParams.ts, useNavigation.ts |
| 2.4 | ClientRouter.tsx (update), nav-utils.ts |
| 2.5 | Link.tsx, prefetch.ts |
| 2.6 | Form.tsx, form-utils.ts |
| 2.7 | Outlet.tsx (full), route-cache.ts |
| 2.8 | useFetcher.ts |
| 3.1 | watcher.ts, rebuilder.ts |
| 3.2 | hmr-server.ts, hmr-client.ts |
| 3.3 | errors.ts (expand), error-overlay.ts |
| 3.4 | meta.ts |
| 3.5 | dev/server.ts, bin/cli.ts (update) |
| 4.1 | hash.ts |
| 4.2 | manifest.ts |
| 4.3 | env-plugin.ts |
| 4.4 | bundler.ts, defines.ts |
| 4.5 | static.ts, bin/cli.ts (update) |
| 5.1 | middleware.ts |
| 5.2 | requestLogger.ts, cors.ts, authGuard.ts |
| 5.3 | session.ts |
| 5.4 | types/*.d.ts |
| 5.5 | bin/cli.ts (expand), templates/ |
| 5.6 | README.md, ROADMAP.md, CHANGELOG.md |
```
