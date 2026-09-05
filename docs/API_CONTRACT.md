# next-web-mcp — public API contract (v0.1.0, revised 2026-09-05)

This is the single source of truth for the package surface. Library authors implement exactly this;
app authors and doc authors code against exactly this. Do not invent extra exports.

## Spec facts (Chrome WebMCP, verified 2026-09-03 against `webmcp-types@0.1.6` + developer.chrome.com)

- `document.modelContext` may be undefined (feature-detect). Never touch `document`/`window` at module scope.
- `await document.modelContext.registerTool(tool, { signal?, exposedTo? })`.
- Tool: `{ name, title?, description, inputSchema?: object (JSON Schema), execute(input, { signal }), annotations?: { readOnlyHint?, untrustedContentHint? } }`.
  `name` must be 1–128 chars, ASCII alphanumeric, `_`, `-`, `.`.
- `execute` returns a string (or a serializable value; we always return a string).
- Unregister = abort the `signal`. Chrome 153+ does not cancel in-flight executions on abort. We use one `AbortController` per registered tool (see Registration semantics).
- `document.modelContext.getTools()` → `Promise<RegisteredTool[]>` (alphabetized). `toolchange` event on `document.modelContext` (it is an EventTarget).
- `document.modelContext.executeTool(tool, jsonString, { signal? })` (Chrome dev-only; not in webmcp-types — call via a loose cast). Returns `null` if the tool triggers navigation.
- Declarative: `<form toolname tooldescription [toolautosubmit]>`, inputs may carry `toolparamdescription`. On agent submit `SubmitEvent.agentInvoked === true`; call `e.preventDefault()` then `e.respondWith(promise)`. `window` events `toolactivated` / `toolcancel` carry `toolName`. CSS `:tool-form-active`, `:tool-submit-active`.

Chrome 150 deviations from `webmcp-types@0.1.6`, verified on the live demo 2026-09-04: `registerTool()` returns `undefined`
(wrap in `Promise.resolve` + `try/catch`); `execute(input)` receives one argument (per-call `signal` optional, merged with the mount
signal); `executeTool()` accepts only the `RegisteredTool` object from `getTools()`.

## Entry points

```
next-web-mcp            (client-safe; file starts with "use client")
next-web-mcp/form       ("use client"; ships the JSX typings for the WebMCP attributes)
next-web-mcp/devtools   ("use client"; dev-only; returns null in production)
next-web-mcp/manifest   (server-safe: no React, no "use client"; buildManifest + createManifestHandler)
next-web-mcp/server     (server-safe: no React, no "use client"; toolAction for the server side of a tool)
next-web-mcp/internal   (test-only: __resetForTests, registry store)
```

There is no config entry point (the old `next.config` wrapper is gone). The manifest is served by a route handler, not written to `public/`.

Under the `react-server` export condition (Server Components, route handlers, server actions) `next-web-mcp` resolves to
`dist/index.server.js`, which carries no `"use client"` directive: `tool`, `defineTools`, `navigationTool`, `unwrap`,
`NextWebMCPError` and `isModelContextAvailable` are the real functions there (so a `tools.ts` module can be shared with
`createManifestHandler`), while the components and hooks are re-exported from the `"use client"` chunk and stay client
references.

## `next-web-mcp`

```ts
import type { z } from "zod";

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  /** Passed through verbatim for newer Chrome builds. */
  consequentialHint?: boolean;
};

export type ConfirmRequest = {
  title: string; // e.g. "Start checkout"
  description?: string; // one sentence
  details?: Array<{ label: string; value: string }>; // rendered as a small table
};

export type ToolContext = {
  params: Record<string, string | string[]>; // from useParams(), as of the call (not the registration)
  pathname: string; // from usePathname(), as of the call
  searchParams: URLSearchParams; // read from window.location.search when the tool runs (no useSearchParams Suspense bailout)
  router: AppRouterInstance; // from useRouter() (next/navigation), as of the call
  confirm: (req: ConfirmRequest, signal?: AbortSignal) => Promise<boolean>;
};

export type ToolExecuteOptions = { signal: AbortSignal };

export type ToolDef<TInput extends z.ZodTypeAny = z.ZodTypeAny> = {
  readonly name?: string; // defaults to the key when used in defineTools()
  readonly title?: string;
  readonly description: string;
  readonly input: TInput; // Zod schema → JSON Schema via z.toJSONSchema (Zod 4)
  readonly annotations?: ToolAnnotations;
  readonly confirm?: boolean | ((input: z.infer<TInput>, ctx: ToolContext) => ConfirmRequest);
  readonly execute: (
    ctx: ToolContext,
  ) => (input: z.infer<TInput>, opts: ToolExecuteOptions) => Promise<string | object>;
};

export function tool<TInput extends z.ZodTypeAny>(def: ToolDef<TInput>): ToolDef<TInput>;
export function defineTools(map: Record<string, ToolDef<any>>): ToolDef[]; // fills name from key if missing

/** One page an agent may open through navigationTool(). `path` is an App Router pattern. */
export type NavigationRoute = {
  path: string; // "/", "/product/[handle]", "/docs/[...slug]", "/docs/[[...slug]]"
  description: string; // read by the agent
  params?: z.ZodObject<any>; // extra validation for the [segment] values (presence is always checked)
  query?: z.ZodObject<any>; // validation for `query`; its keys are listed in the description
};
/** Builds an ordinary ToolDef (via tool()) named `navigate_to` from an allowlist of routes. See "navigationTool semantics". */
export function navigationTool(options: {
  routes: NavigationRoute[]; // at least one, else NextWebMCPError TOOL_NAME_INVALID
  name?: string; // default "navigate_to"
  description?: string; // leading sentence; default "Open another page of this site."
  replace?: boolean; // router.replace instead of router.push; default false
  scroll?: boolean; // forwarded to the router as { scroll } when set
}): ToolDef;

/** What a toolAction() server action resolves to (see next-web-mcp/server). Exported from both entries. */
export type ToolActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
/** result.data, or throws new Error(result.error) — inside execute the agent then reads `<name> failed: <error>. …`. */
export function unwrap<T>(result: ToolActionResult<T>): T;

export type ModelContextProps = {
  tools: ToolDef[];
  children?: React.ReactNode;
  /** Render <ToolConfirmations/> from the outermost ModelContext. Default true. */
  confirmations?: boolean;
};
export function ModelContext(props: ModelContextProps): React.JSX.Element;
export function ToolConfirmations(): React.JSX.Element | null;
export function useToolCalls(): ToolCallRecord[]; // newest first, max 200
export function useModelContextTools(): RegisteredToolInfo[]; // live getTools() + toolchange
export function isModelContextAvailable(): boolean;

export type ToolCallRecord = {
  id: string;
  name: string;
  route: string;
  args: unknown;
  startedAt: number;
  durationMs: number;
  result: string;
  ok: boolean;
};
export type RegisteredToolInfo = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  route?: string; // pathname the owning <ModelContext> currently renders under (from our registry; follows navigation; undefined for tools we did not register, e.g. declarative forms)
};

export type NextWebMCPErrorCode =
  | "TOOL_NAME_DUPLICATE"
  | "TOOL_NAME_INVALID"
  | "MODEL_CONTEXT_UNAVAILABLE"
  | "ZOD_TO_JSON_SCHEMA_UNSUPPORTED"
  | "CONFIRM_TIMEOUT"
  | "CONFIRM_NO_RENDERER";

export class NextWebMCPError extends Error {
  code: NextWebMCPErrorCode;
}
```

Execution semantics inside `ModelContext` (per call; `def` and `ctx` are the latest definition and route context at the time of the call, see Registration semantics):

1. Parse raw input with `await def.input.safeParseAsync` (so async refinements work in a schema shared with `toolAction`). On failure return
   `Invalid input for <name>: <issue path>: <message>; ... Fix the arguments and call again.`
2. If `confirm` is set: build a `ConfirmRequest` (boolean → `{ title: <title ?? name>, details: <args as label/value> }`).
   If the registry has no pending-confirmation listener (nothing mounted to render the card), reject immediately with
   `NextWebMCPError` code `CONFIRM_NO_RENDERER` and message
   `Tool "<name>" needs approval but no <ToolConfirmations/> is mounted. Keep the default confirmations on <ModelContext>, or mount <ToolConfirmations/> yourself.`
   — the tool returns the step-4 `<name> failed: …` string and `warnOnce` logs it in dev. No silent 60 s hang.
   Otherwise `await ctx.confirm(req, signal)`. `false` → return `User declined <name>.` Timeout 60 s or aborted signal → deny.
3. `const result = await def.execute(ctx)(parsed, { signal })`. string → passthrough; object → `JSON.stringify(result)`.
4. Thrown error → return `<name> failed: <error.message>. Check the page state and try again.` Never return raw stack traces.
5. Record `{ name, route: pathname, args, durationMs, result, ok }` in the registry (ring buffer 200) — dev and prod (cheap).
6. Tools that navigate must compute and return their string first and call `router.push` in a microtask/after (documented; the app is responsible).

Registration semantics (register by stable key, since 2026-09-05):

- **Identity.** Each `ToolDef` has a stable key: the JSON of `{ name, title, description, inputSchema, annotations }`, where
  `inputSchema = toolInputToJsonSchema(def.input)` (WeakMap-cached). `confirm` and `execute` are not part of the key. Keys are
  computed in effects (or memoized), never during render; nothing touches `document` during render.
- **Diffing.** An instance keeps `Map<name, { key, controller }>`. The registration effect depends on `[tools]` only. On every
  run, for each def: unknown name → `registerTool(native, { signal })` with a NEW `AbortController` for that tool; same name and
  same key → nothing; same name and different key → abort the old controller, register anew. Names present before and absent
  now → abort. Unmount → abort all. One controller per tool, never per mount: a change to one tool does not churn its siblings.
- **Latest-closure dispatch.** A ref `latest = { defsByName, pathname, params, router }` is synced in an effect declared before
  the registration effect. The native `execute` wrapper reads `latest.current` when the call arrives: `def` (so a new factory
  result under the same key runs the new `execute`/`confirm`), `pathname`, `params`, `router`. `ctx.searchParams` is read
  lazily from `window.location.search`. The per-call signal is `anySignal([options.signal?, thisTool.controller.signal])`.
- **Route attribution.** `registry.registerTool(name, info)` runs once per (re)registration with the pathname at that time;
  `registry.updateToolRoute(name, route)` runs from a `[pathname]` effect for the instance's names, so `RegisteredToolInfo.route`
  and the DevTools grouping follow navigation without any `document.modelContext` call.
- **Guarantees.** Re-renders, new `tools` array identities, `pathname`/`params` changes and new factory results with the same
  identity never re-register (no `toolchange`, no window where a still-mounted tool is missing). `execute` always runs the
  latest definition with the current route context. Under StrictMode a mount still ends with exactly one registration per tool.
- Duplicate names across nested `ModelContext`s: dev `console.warn` once (`TOOL_NAME_DUPLICATE`); the registration that
  lands last wins (Chrome replaces same-name tools). Instances mounted in the same commit register child-first (React runs
  inner effects before outer ones), so the outer definition wins; an inner instance mounted in a later commit wins. Pinned by tests.
- No `document.modelContext`: `console.info` once (`[next-web-mcp] document.modelContext is unavailable…`) and no-op. Never throw in render or effects.
- Feature detection helper `isModelContextAvailable()` is exported too.

Confirm UI:

- `<ToolConfirmations/>` subscribes to the registry’s pending confirmations and renders a fixed-position card
  (`role="dialog"`, `aria-live="polite"`, keyboard: Enter = approve, Escape = deny). Approve/Deny buttons resolve the promise.
- `<ModelContext>` provides a React context of its own. The **outermost** instance (no provider above it) renders
  `<ToolConfirmations/>` as a sibling of `children` when `confirmations !== false`; nested instances see the provider and render
  nothing extra. `confirmations={false}` on the outermost instance opts out so the app can place `<ToolConfirmations/>` itself.
- The registry exposes the count of pending-confirmation subscribers; step 2 above uses it.

## `next-web-mcp/form`

```ts
import type { FormProps } from "next/form";

export type ToolFormProps<R = unknown> = Omit<FormProps, "action"> & {
  /** A URL, or a (server) action whose return value feeds `respond`. No cast needed for actions that return data. */
  action: string | ((formData: FormData) => R | Promise<R>);
  /** Maps the action's return value to the string handed to e.respondWith(). Default: String(result ?? "Done"). */
  respond?: (result: R) => string;
  toolname: string;
  tooldescription: string;
  toolautosubmit?: boolean;
};
export default function Form<R = unknown>(props: ToolFormProps<R>): React.JSX.Element;

// Global JSX augmentation shipped by this entry (must survive into dist/form.d.ts; verified by grep and by
// typechecking examples/commerce with the consumer's own augmentation deleted):
declare module "react" {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: boolean;
  }
  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
```

Behavior: renders `next/form`'s `Form` with the WebMCP attributes spread onto the DOM element.
`onSubmit` checks `(e.nativeEvent as WebMCPSubmitEvent).agentInvoked`; if true → `e.preventDefault()`, run the `action`
(function) with `new FormData(e.currentTarget)` and pass the promise (mapped through `respond`; a rejection becomes
`<toolname> failed: <message>`) to `e.nativeEvent.respondWith(...)`.
If `action` is a string URL, fall back to native submit. Sets `data-tool-active` while `toolactivated` for this `toolname` until `toolcancel`/submit.
If the dts bundler drops the ambient augmentation, ship it as `dist/form-jsx.d.ts` referenced from `dist/form.d.ts`.

## `next-web-mcp/devtools`

```ts
export type WebMCPDevToolsProps = {
  position?: "bottom-right" | "bottom-left";
  defaultOpen?: boolean;
  /** Render in production too (demos only). */
  force?: boolean;
};
export function WebMCPDevTools(props?: WebMCPDevToolsProps): React.JSX.Element | null;
```

`process.env.NODE_ENV === "production"` → returns null unless `props.force === true`.
Panel: (a) Tools tab — live list from `getTools()` (refresh on `toolchange`), grouped by route (from registry; "declarative / other" otherwise), each with description + JSON schema toggle;
(b) Run — pick a tool, JSON args textarea, "Run" calls `document.modelContext.executeTool(tool, json)` and shows the result (or "navigated (null)");
(c) Calls — `useToolCalls()` log with args, ms, result; (d) "Copy prompt" button per tool that copies a natural-language prompt derived from the schema.
Inline styles / CSS variables only, no global CSS. Zero dependencies.

## `next-web-mcp/manifest`

```ts
import type { ToolAnnotations, ToolDef } from "next-web-mcp";

export type ManifestTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: ToolAnnotations;
};
export type ManifestRoute = { route: string; tools: ManifestTool[] };
export type WebMCPManifest = { version: 1; routes: ManifestRoute[] };
/** Route pattern → tools, e.g. { "/": rootTools, "/product/[handle]": productTools }. */
export type ManifestRoutes = Record<string, ToolDef[]>;

/** Uses toolInputToJsonSchema; throws NextWebMCPError TOOL_NAME_INVALID if a ToolDef has no name. */
export function buildManifest(routes: ManifestRoutes): WebMCPManifest;
/** GET handler: JSON body, content-type application/json, Cache-Control: public, max-age=300. */
export function createManifestHandler(
  routes: ManifestRoutes | (() => ManifestRoutes | Promise<ManifestRoutes>),
): () => Promise<Response>;
```

Usage in an app:

```ts
// app/.well-known/webmcp.json/route.ts
export const GET = createManifestHandler(async () => ({
  "/": rootTools,
  "/product/[handle]": createProductTools(sample),
  "/search": createSearchTools(await getCollections()),
}));
```

Server-safe: no React import, no `"use client"`, not in `CLIENT_ENTRIES` of `tsdown.config.ts`. Route order in the output
follows the object's key order; tool order follows the array. Nothing is written to `public/`.

`navigationTool` semantics (`src/navigation-tool.ts`; pinned by `test/navigation-tool.test.tsx`):

- Input schema: `{ route: z.enum(paths), params?: z.record(z.string(), z.string()), query?: z.record(z.string(), z.string()) }`.
  No `annotations` (the tool changes the page). `name` is validated by `tool()`; empty `routes` throws
  `NextWebMCPError("TOOL_NAME_INVALID")` at definition time.
- Description: `<options.description ?? "Open another page of this site.">\nRoutes:\n- <path> — <description> Needs params: a, b. Optional params: slug. Query: q; optional: sort.`
  — one `- ` line per route; `Needs params:` lists the non-optional `[segment]`s, `Optional params:` the `[[...name]]` ones,
  `Query:` the keys of `query` (required first, then `optional: …`). Notes are omitted when empty.
- `execute`, in order: unknown `route` (only reachable when called directly; `<ModelContext>` rejects it as `Invalid input for
<name>: route: …`) → `Unknown route "<route>". Available: <paths joined by ", ">.`; a non-optional segment with no value
  (missing, empty, or a catch-all of only `/`) → `Route "<path>" needs params: <names>.`; `route.params.safeParse` fails →
  `Invalid params for route "<path>": <path>: <message>; … Fix the arguments and call again.`; `route.query.safeParse` fails →
  `Invalid query for route "<path>": …. Fix the arguments and call again.`. Otherwise the href is built (plain segments
  `encodeURIComponent`-encoded whole; catch-all values split on `/`, empty pieces dropped, each piece encoded; `[[...name]]`
  without a value removes the segment; query appended with `URLSearchParams`), the tool returns `Navigating to <href>.` and
  calls `router.push(href, scroll === undefined ? undefined : { scroll })` (or `router.replace`) in `setTimeout(…, 0)`.
- Without `params`/`query` schemas the values pass through unchecked apart from segment presence.

## `next-web-mcp/server`

```ts
import type { z } from "zod";

export type ToolActionResult<T> = { ok: true; data: T } | { ok: false; error: string }; // same type as the main entry

export type ToolActionOptions<S extends z.ZodTypeAny, R> = {
  output?: z.ZodType<R>; // checks the handler's result; on success the parsed value is returned
  onError?: (error: unknown) => string; // maps a thrown error to the sentence the agent reads
};

/** Wraps a server action; the returned async function is the action. Parses with safeParseAsync. Never throws. */
export function toolAction<S extends z.ZodTypeAny, R>(
  input: S,
  handler: (input: z.infer<S>) => Promise<R> | R,
  options?: ToolActionOptions<S, R>,
): (raw: unknown) => Promise<ToolActionResult<R>>;
```

Semantics (`src/server.ts`; pinned by `test/server.test.ts`):

1. `await input.safeParseAsync(raw)`; on failure resolve `{ ok: false, error: "Invalid input: <path>: <message>; … Fix the arguments and call again." }`
   using the same `formatZodIssues` as `<ModelContext>` (`(root)` for an empty path). The handler does not run.
2. `await handler(parsed.data)`; if it throws: `console.error(err)`, then `{ ok: false, error: onError?.(err) ?? "The action failed on the server. Try again." }`.
   The thrown message is never returned unless `onError` returns it; if `onError` throws, that error is logged and the generic sentence is used.
   A non-Zod error thrown by a `.transform`/`.refine` body during the input or output parse (Zod 4 rethrows those from
   `safeParseAsync`) takes the same path, so the action never rejects.
3. With `output`: `await output.safeParseAsync(result)`; on failure `console.error("[next-web-mcp] toolAction: the handler's result failed the output schema: …")`
   and `{ ok: false, error: "The server returned an unexpected result." }`; on success `{ ok: true, data: checked.data }`.
4. Without `output`: `{ ok: true, data: result }`.

Server-safe: no React, no `"use client"`, no `document`/`window`. The result is a plain object (serializable across the
server-action boundary). `unwrap` lives on the main entry (and is a real function under `react-server`) so tools call it
without importing the server entry.

## `next-web-mcp/internal`

```ts
export function __resetForTests(): void;
export const registry: { getState(): RegistryState; subscribe(cb: () => void): () => void; updateToolRoute(name: string, route: string): void; ... };
```
