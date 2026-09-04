# next-webmcp — public API contract (v0.1.0)

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

## Entry points

```
next-webmcp            (client-safe; file starts with "use client")
next-webmcp/form       ("use client")
next-webmcp/devtools   ("use client"; dev-only; returns null in production)
next-webmcp/config     (server/node only; withWebMCP + manifest writer)
next-webmcp/internal   (test-only: __resetForTests, registry store)
```

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
  searchParams: URLSearchParams; // from useSearchParams()
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

export function ModelContext(props: {
  tools: ToolDef[];
  children?: React.ReactNode;
}): React.JSX.Element;
export function ToolConfirmations(): React.JSX.Element | null;
export function useToolCalls(): ToolCallRecord[]; // newest first, max 200
export function useModelContextTools(): RegisteredToolInfo[]; // live getTools() + toolchange

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

export class NextWebMCPError extends Error {
  code:
    | "TOOL_NAME_DUPLICATE"
    | "TOOL_NAME_INVALID"
    | "MODEL_CONTEXT_UNAVAILABLE"
    | "ZOD_TO_JSON_SCHEMA_UNSUPPORTED"
    | "CONFIRM_TIMEOUT";
}
```

Execution semantics inside `ModelContext` (per tool, per mount):

1. Parse raw input with `def.input.safeParse`. On failure return
   `Invalid input for <name>: <issue path>: <message>; ... Fix the arguments and call again.`
2. If `confirm` is set: build a `ConfirmRequest` (boolean → `{ title: <title ?? name>, details: <args as label/value> }`),
   `await ctx.confirm(req, signal)`. `false` → return `User declined <name>.` Timeout 60 s or aborted signal → deny.
3. `const result = await def.execute(ctx)(parsed, { signal })`. string → passthrough; object → `JSON.stringify(result)`.
4. Thrown error → return `<name> failed: <error.message>. Check the page state and try again.` Never return raw stack traces.
5. Record `{ name, route: pathname, args, durationMs, result, ok }` in the registry (ring buffer 200) — dev and prod (cheap).
6. Tools that navigate must compute and return their string first and call `router.push` in a microtask/after (documented; the app is responsible).

Registration semantics:

- One `AbortController` per `<ModelContext>` mount. Register on mount; abort on unmount. Re-register when `pathname` or serialized `params` change (so `ctx` is fresh).
- Duplicate names across nested `ModelContext`s: dev `console.warn` once (`TOOL_NAME_DUPLICATE`); the later registration wins (Chrome replaces same-name tools).
- No `document.modelContext`: `console.info` once (`[next-webmcp] document.modelContext is unavailable…`) and no-op. Never throw in render or effects.
- Feature detection helper `isModelContextAvailable()` is exported too.

Confirm UI: `<ToolConfirmations/>` subscribes to the registry’s pending confirmations and renders a fixed-position card
(`role="dialog"`, `aria-live="polite"`, keyboard: Enter = approve, Escape = deny). Approve/Deny buttons resolve the promise.

## `next-webmcp/form`

```ts
import type { FormProps } from "next/form";
export type ToolFormProps = FormProps & {
  toolname: string;
  tooldescription: string;
  toolautosubmit?: boolean;
  /** Maps the server action's return value to the string handed to e.respondWith(). Default: String(result ?? "Done"). */
  respond?: (result: unknown) => string;
};
export default function Form(props: ToolFormProps): React.JSX.Element;
```

Behavior: renders `next/form`'s `Form` with the WebMCP attributes spread onto the DOM element.
`onSubmit` checks `(e.nativeEvent as any).agentInvoked`; if true → `e.preventDefault()`, run the `action` (function) with `new FormData(e.currentTarget)` and pass the promise (mapped through `respond`) to `e.nativeEvent.respondWith(...)`.
If `action` is a string URL, fall back to native submit. Sets `data-tool-active` while `toolactivated` for this `toolname` until `toolcancel`/submit.

## `next-webmcp/devtools`

```ts
export function WebMCPDevTools(props?: {
  position?: "bottom-right" | "bottom-left";
  defaultOpen?: boolean;
}): React.JSX.Element | null;
```

`process.env.NODE_ENV === "production"` → returns null unless `props.force === true` (undocumented escape hatch for demos: `force?: boolean`).
Panel: (a) Tools tab — live list from `getTools()` (refresh on `toolchange`), grouped by route (from registry; "declarative / other" otherwise), each with description + JSON schema toggle;
(b) Run — pick a tool, JSON args textarea, "Run" calls `document.modelContext.executeTool(tool, json)` and shows the result (or "navigated (null)");
(c) Calls — `useToolCalls()` log with args, ms, result; (d) "Copy prompt" button per tool that copies a natural-language prompt derived from the schema.
Inline styles / CSS variables only, no global CSS. Zero dependencies.

## `next-webmcp/config`

```ts
export type WebMCPManifestRoute = {
  route: string;
  tools: Array<{ name: string; description: string; inputSchema?: object }>;
};
export function withWebMCP<T extends object>(
  nextConfig: T,
  options?: { manifest?: { routes: WebMCPManifestRoute[]; outFile?: string } },
): T;
```

When `options.manifest` is provided, writes `public/.well-known/webmcp.json` at config-load time (sync `node:fs`). Returns the config untouched otherwise.
Do NOT import `server-only` here (next.config is loaded in plain Node); just never import this from client code.

## `next-webmcp/internal`

```ts
export function __resetForTests(): void;
export const registry: { getState(): RegistryState; subscribe(cb: () => void): () => void; ... };
```
