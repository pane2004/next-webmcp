# next-webmcp — public API contract (v0.1.0, revised 2026-09-04)

This is the single source of truth for the package surface. Library authors implement exactly this;
app authors and doc authors code against exactly this. Do not invent extra exports.

## Spec facts (Chrome WebMCP, verified 2026-09-03 against `webmcp-types@0.1.6` + developer.chrome.com)

- `document.modelContext` may be undefined (feature-detect). Never touch `document`/`window` at module scope.
- `await document.modelContext.registerTool(tool, { signal?, exposedTo? })`.
- Tool: `{ name, title?, description, inputSchema?: object (JSON Schema), execute(input, { signal }), annotations?: { readOnlyHint?, untrustedContentHint? } }`.
  `name` must be 1–128 chars, ASCII alphanumeric, `_`, `-`, `.`.
- `execute` returns a string (or a serializable value; we always return a string).
- Unregister = abort the `signal`. Chrome 153+ does not cancel in-flight executions on abort. Use one `AbortController` per mount.
- `document.modelContext.getTools()` → `Promise<RegisteredTool[]>` (alphabetized). `toolchange` event on `document.modelContext` (it is an EventTarget).
- `document.modelContext.executeTool(tool, jsonString, { signal? })` (Chrome dev-only; not in webmcp-types — call via a loose cast). Returns `null` if the tool triggers navigation.
- Declarative: `<form toolname tooldescription [toolautosubmit]>`, inputs may carry `toolparamdescription`. On agent submit `SubmitEvent.agentInvoked === true`; call `e.preventDefault()` then `e.respondWith(promise)`. `window` events `toolactivated` / `toolcancel` carry `toolName`. CSS `:tool-form-active`, `:tool-submit-active`.

Chrome 150 deviations from `webmcp-types@0.1.6`, verified on the live demo 2026-09-04: `registerTool()` returns `undefined`
(wrap in `Promise.resolve` + `try/catch`); `execute(input)` receives one argument (per-call `signal` optional, merged with the mount
signal); `executeTool()` accepts only the `RegisteredTool` object from `getTools()`.

## Entry points

```
next-webmcp            (client-safe; file starts with "use client")
next-webmcp/form       ("use client"; ships the JSX typings for the WebMCP attributes)
next-webmcp/devtools   ("use client"; dev-only; returns null in production)
next-webmcp/manifest   (server-safe: no React, no "use client"; buildManifest + createManifestHandler)
next-webmcp/internal   (test-only: __resetForTests, registry store)
```

There is no config entry point (the old `next.config` wrapper is gone). The manifest is served by a route handler, not written to `public/`.

Under the `react-server` export condition (Server Components, route handlers, server actions) `next-webmcp` resolves to
`dist/index.server.js`, which carries no `"use client"` directive: `tool`, `defineTools`, `NextWebMCPError` and
`isModelContextAvailable` are the real functions there (so a `tools.ts` module can be shared with `createManifestHandler`),
while the components and hooks are re-exported from the `"use client"` chunk and stay client references.

## `next-webmcp`

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
  params: Record<string, string | string[]>; // from useParams()
  pathname: string; // from usePathname()
  searchParams: URLSearchParams; // read from window.location.search when the tool runs (no useSearchParams Suspense bailout)
  router: AppRouterInstance; // from useRouter() (next/navigation)
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
  route?: string; // route = pathname that registered it (from our registry; undefined for tools we did not register, e.g. declarative forms)
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

Execution semantics inside `ModelContext` (per tool, per mount):

1. Parse raw input with `def.input.safeParse`. On failure return
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

Registration semantics:

- One `AbortController` per `<ModelContext>` mount. Register on mount; abort on unmount. Re-register when `pathname` or serialized `params` change (so `ctx` is fresh).
- Duplicate names across nested `ModelContext`s: dev `console.warn` once (`TOOL_NAME_DUPLICATE`); the later registration wins (Chrome replaces same-name tools).
- No `document.modelContext`: `console.info` once (`[next-webmcp] document.modelContext is unavailable…`) and no-op. Never throw in render or effects.
- Feature detection helper `isModelContextAvailable()` is exported too.

Confirm UI:

- `<ToolConfirmations/>` subscribes to the registry’s pending confirmations and renders a fixed-position card
  (`role="dialog"`, `aria-live="polite"`, keyboard: Enter = approve, Escape = deny). Approve/Deny buttons resolve the promise.
- `<ModelContext>` provides a React context of its own. The **outermost** instance (no provider above it) renders
  `<ToolConfirmations/>` as a sibling of `children` when `confirmations !== false`; nested instances see the provider and render
  nothing extra. `confirmations={false}` on the outermost instance opts out so the app can place `<ToolConfirmations/>` itself.
- The registry exposes the count of pending-confirmation subscribers; step 2 above uses it.

## `next-webmcp/form`

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

## `next-webmcp/devtools`

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

## `next-webmcp/manifest`

```ts
import type { ToolAnnotations, ToolDef } from "next-webmcp";

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

## `next-webmcp/internal`

```ts
export function __resetForTests(): void;
export const registry: { getState(): RegistryState; subscribe(cb: () => void): () => void; ... };
```
