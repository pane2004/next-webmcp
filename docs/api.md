# next-webmcp API reference

Every public export, with its signature, behavior, and an example. For the pitch, the quick start, and the
spec-alignment table see the [README](../README.md); for the binding contract that the implementation and
tests follow see [API_CONTRACT.md](./API_CONTRACT.md).

```sh
pnpm add next-webmcp zod
```

Peers: `next >= 15`, `react >= 19`, `react-dom >= 19`, `zod ^4`. Node 20+.

## Entry points

| Import                 | Runs in       | Contents                                                                                    |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `next-webmcp`          | client        | `tool`, `defineTools`, `ModelContext`, `ToolConfirmations`, hooks, `NextWebMCPError`, types |
| `next-webmcp/form`     | client        | `Form` — `next/form` with the WebMCP attributes and `respondWith`; ships the JSX typings    |
| `next-webmcp/manifest` | server / Node | `createManifestHandler`, `buildManifest`, manifest types                                    |
| `next-webmcp/devtools` | client, dev   | `WebMCPDevTools`                                                                            |
| `next-webmcp/internal` | tests         | `__resetForTests`, `registry`                                                               |

The client entries start with `"use client"`. `next-webmcp/manifest` imports no React and can be used from
route handlers, server components, and scripts.

A `tools.ts` module that imports `tool` from `next-webmcp` can be shared between a page and the manifest route
handler: under the `react-server` export condition (Server Components, route handlers, server actions) the
package resolves to a directive-free build in which `tool`, `defineTools`, `NextWebMCPError` and
`isModelContextAvailable` are the real functions, while the components and hooks remain client references.

## `next-webmcp`

### `tool(def)`

Identity function that infers the input type from the Zod schema so `execute` and `confirm` are typed.
Validates the name (if given) and converts the schema eagerly, so a bad name or an unsupported Zod version
fails at module load, not in render.

```ts
import { z } from "zod";
import { tool } from "next-webmcp";

export const getTime = tool({
  name: "get_time",
  description: "Return the current time in the browser as an ISO-8601 string.",
  input: z.object({}),
  annotations: { readOnlyHint: true },
  execute: () => async () => new Date().toISOString(),
});
```

`ToolDef<TInput>` fields:

| Field          | Type                                                                     | Notes                                                       |
| -------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `name?`        | `string`                                                                 | `[A-Za-z0-9_.-]{1,128}`; defaults to the `defineTools` key. |
| `title?`       | `string`                                                                 | Used in confirm cards and DevTools.                         |
| `description`  | `string`                                                                 | Read by the agent. State what it does and what it returns.  |
| `input`        | `z.ZodTypeAny`                                                           | Converted with `z.toJSONSchema` (Zod 4).                    |
| `annotations?` | `{ readOnlyHint?, untrustedContentHint?, consequentialHint? }`           | Forwarded to Chrome.                                        |
| `confirm?`     | `boolean \| (input, ctx) => ConfirmRequest`                              | `true` builds a card from the title and the arguments.      |
| `execute`      | `(ctx: ToolContext) => (input, { signal }) => Promise<string \| object>` | Objects are `JSON.stringify`ed.                             |

`ToolContext`, passed to `execute(ctx)` and `confirm(input, ctx)`:

| Field          | Source                                                                               |
| -------------- | ------------------------------------------------------------------------------------ |
| `params`       | `useParams()`                                                                        |
| `pathname`     | `usePathname()`                                                                      |
| `searchParams` | `URLSearchParams` of the current URL, read when the tool runs                        |
| `router`       | `useRouter()` from `next/navigation`                                                 |
| `confirm`      | `(req: ConfirmRequest, signal?) => Promise<boolean>` — the same gate `confirm:` uses |

`ConfirmRequest` is `{ title: string; description?: string; details?: Array<{ label: string; value: string }> }`.

### `defineTools(map)`

Turns a keyed object into `ToolDef[]`, filling `name` from the key when it is missing.

```ts
import { z } from "zod";
import { defineTools, tool } from "next-webmcp";

export const tools = defineTools({
  get_cart: tool({
    description: "Return the current cart as JSON.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    execute: () => async () => ({ items: [], total: "0.00" }),
  }),
});
```

### `<ModelContext tools children? confirmations? />`

Registers `tools` on mount, aborts on unmount, re-registers when `pathname` or `params` change. Nest freely;
the later registration wins on name collisions (dev warning `TOOL_NAME_DUPLICATE`). Without
`document.modelContext` it renders its children and logs one `console.info`.

| Prop            | Type              | Default | Notes                                                             |
| --------------- | ----------------- | ------- | ----------------------------------------------------------------- |
| `tools`         | `ToolDef[]`       | —       | Usually the result of `defineTools`.                              |
| `children`      | `React.ReactNode` | —       | Rendered unchanged.                                               |
| `confirmations` | `boolean`         | `true`  | Whether the outermost `<ModelContext>` renders the approval card. |

```tsx
"use client";
import { ModelContext } from "next-webmcp";
import { tools } from "./tools";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ModelContext tools={tools}>{children}</ModelContext>;
}
```

The **outermost** `<ModelContext>` in the tree renders `<ToolConfirmations />` next to its children; nested
instances detect the outer one through a React context and render nothing extra. Pass
`confirmations={false}` on the outermost instance to mount `<ToolConfirmations />` yourself (for example
inside a portal or a specific stacking context).

Execution pipeline per call:

1. `def.input.safeParse(raw)` — on failure the agent gets
   `Invalid input for <name>: <path>: <message>; … Fix the arguments and call again.`
2. `confirm` — if no confirmations renderer is mounted, the call fails at once with `CONFIRM_NO_RENDERER`
   (see [Error codes](#error-codes)). Otherwise `false`, a 60 s timeout, or an aborted signal returns
   `User declined <name>.`
3. `await def.execute(ctx)(parsed, { signal })` — strings pass through, objects are stringified.
4. Thrown errors become `<name> failed: <message>. Check the page state and try again.` No stack traces.
5. The call is appended to the 200-entry ring buffer behind `useToolCalls()`.

### `<ToolConfirmations />`

Renders the pending confirm card: fixed position, `role="dialog"`, `aria-live="polite"`, Enter approves,
Escape denies. `<ModelContext>` mounts it for you; use it directly only with `confirmations={false}`.

```tsx
"use client";
import { ModelContext, ToolConfirmations } from "next-webmcp";
import { tools } from "./tools";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelContext tools={tools} confirmations={false}>
      {children}
      <div id="agent-ui">
        <ToolConfirmations />
      </div>
    </ModelContext>
  );
}
```

### `useToolCalls()`

Returns `ToolCallRecord[]`, newest first, at most 200 entries, and re-renders on every call. Works in
production.

```tsx
"use client";
import { useToolCalls } from "next-webmcp";

export function CallLog() {
  const calls = useToolCalls();
  return (
    <ul>
      {calls.map((c) => (
        <li key={c.id}>
          {c.name} on {c.route} — {c.ok ? "ok" : "error"} in {c.durationMs} ms
        </li>
      ))}
    </ul>
  );
}
```

`ToolCallRecord`: `{ id, name, route, args, startedAt, durationMs, result, ok }`.

### `useModelContextTools()`

Live list from `document.modelContext.getTools()`, refreshed on `toolchange`. Tools registered by
`<ModelContext>` carry the `route` that registered them; declarative forms and other registrations do not.

```tsx
"use client";
import { useModelContextTools } from "next-webmcp";

export function LiveTools() {
  const tools = useModelContextTools();
  return (
    <ul>
      {tools.map((t) => (
        <li key={t.name}>
          <code>{t.name}</code> {t.route ?? "declarative / other"} — {t.description}
        </li>
      ))}
    </ul>
  );
}
```

`RegisteredToolInfo`: `{ name, title?, description, inputSchema?, annotations?, route? }`.

### `isModelContextAvailable()`

`true` when `document.modelContext` exists. Always `false` during SSR.

```ts
import { isModelContextAvailable } from "next-webmcp";

if (isModelContextAvailable()) {
  // safe to touch document.modelContext
}
```

### `NextWebMCPError`

`Error` subclass with a stable `code` (`NextWebMCPErrorCode`). Messages are prefixed with `[next-webmcp]`.

```ts
import { NextWebMCPError } from "next-webmcp";

try {
  // ...
} catch (err) {
  if (err instanceof NextWebMCPError && err.code === "ZOD_TO_JSON_SCHEMA_UNSUPPORTED") {
    // upgrade zod
  }
}
```

### Error codes

| `code`                           | Meaning                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOOL_NAME_INVALID`              | Name outside `[A-Za-z0-9_.-]{1,128}`, or a `ToolDef` without a name reached `buildManifest`.                                                                                                                                                                                                                                                                                      |
| `TOOL_NAME_DUPLICATE`            | Same name registered by two mounted contexts (dev warning; later wins).                                                                                                                                                                                                                                                                                                           |
| `MODEL_CONTEXT_UNAVAILABLE`      | `document.modelContext` missing. One `console.info`; registration no-ops.                                                                                                                                                                                                                                                                                                         |
| `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` | No `z.toJSONSchema` on the installed Zod (Zod 3). Thrown by `tool()`/`defineTools()` at definition time; upgrade to Zod 4.                                                                                                                                                                                                                                                        |
| `CONFIRM_TIMEOUT`                | No decision within 60 s; the agent receives `User declined <name>.`.                                                                                                                                                                                                                                                                                                              |
| `CONFIRM_NO_RENDERER`            | A tool with `confirm` ran while nothing was subscribed to render the card. Rejected immediately; the agent receives `<name> failed: [next-webmcp] Tool "<name>" needs approval but no <ToolConfirmations/> is mounted. Keep the default confirmations on <ModelContext>, or mount <ToolConfirmations/> yourself. Check the page state and try again.` Warned once in development. |

### Types

`ToolDef`, `ToolContext`, `ToolAnnotations`, `ConfirmRequest`, `ToolExecuteOptions`, `ToolCallRecord`,
`RegisteredToolInfo`, `ModelContextProps`, `NextWebMCPErrorCode`, `AppRouterInstance`, `AnyZodSchema`.

## `next-webmcp/form`

### `Form` (default export)

`next/form` with the WebMCP declarative attributes. On an agent-initiated submit (`SubmitEvent.agentInvoked`)
it calls `event.preventDefault()`, runs the `action` function with the form's `FormData`, and hands the
promise (mapped through `respond`) to `event.respondWith()`. Human submits are untouched. A string `action`
falls back to native submission. While the tool is active (`toolactivated` → `toolcancel`/submit) the
element carries `data-tool-active`.

```ts
type ToolFormProps<R = unknown> = Omit<FormProps, "action"> & {
  action: string | ((formData: FormData) => R | Promise<R>);
  /** Maps the action's return value to the string handed to respondWith(). Default: String(result ?? "Done"). */
  respond?: (result: R) => string;
  toolname: string;
  tooldescription: string;
  toolautosubmit?: boolean;
};
```

```tsx
"use client";
import Form from "next-webmcp/form";
import { subscribe } from "./actions"; // "use server"; (formData: FormData) => Promise<{ ok: boolean }>

export function NewsletterForm() {
  return (
    <Form
      action={subscribe}
      respond={(r) => (r.ok ? "Subscribed." : "Already subscribed.")}
      toolname="subscribe_newsletter"
      tooldescription="Subscribe an email address to the newsletter."
    >
      <input name="email" type="email" required toolparamdescription="Email address to subscribe" />
      <button type="submit">Subscribe</button>
    </Form>
  );
}
```

`action` is typed by its return value (`R`), so a server action that returns data needs no cast, and
`respond` receives that value with its type. If the action throws, the agent receives
`<toolname> failed: <message>`.

#### JSX typings

Importing `next-webmcp/form` augments React's JSX types, so these attributes typecheck in any component of
your app — no `declare module "react"` block of your own:

| Element                             | Attributes                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `<form>`                            | `toolname?: string`, `tooldescription?: string`, `toolautosubmit?: boolean \| ""` |
| `<input>`, `<select>`, `<textarea>` | `toolparamdescription?: string`                                                   |

On a plain `<form>` write `toolautosubmit=""`, not `toolautosubmit` — React drops `true` for custom
attributes, so the attribute never reaches the DOM. `Form` from `next-webmcp/form` takes a boolean and sets it
correctly.

The augmentation is part of `dist/form.d.ts`. If your app already declares the same augmentation, delete it;
the two would conflict only if the types differ.

## `next-webmcp/manifest`

Serves a JSON description of the tools each route exposes, built from the same `ToolDef[]` you pass to
`<ModelContext>`, so the manifest cannot drift from the code.

```ts
type ManifestTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: ToolAnnotations;
};
type ManifestRoute = { route: string; tools: ManifestTool[] };
type WebMCPManifest = { version: 1; routes: ManifestRoute[] };
/** Route pattern → tools, e.g. { "/": rootTools, "/product/[handle]": productTools } */
type ManifestRoutes = Record<string, ToolDef[]>;

function buildManifest(routes: ManifestRoutes): WebMCPManifest;
function createManifestHandler(
  routes: ManifestRoutes | (() => ManifestRoutes | Promise<ManifestRoutes>),
): () => Promise<Response>;
```

### `createManifestHandler(routes)`

Returns a GET route handler. The response body is `buildManifest(routes)` as JSON with
`content-type: application/json` and `Cache-Control: public, max-age=300`. Pass a function when a route's
tools depend on data; it runs on every request.

```ts
// app/.well-known/webmcp.json/route.ts
import { createManifestHandler } from "next-webmcp/manifest";
import { rootTools } from "@/app/tools";
import { createProductTools } from "@/app/product/[handle]/tools";
import { createSearchTools } from "@/app/search/tools";
import { getCollections, sampleProduct } from "@/lib/catalog";

export const GET = createManifestHandler(async () => ({
  "/": rootTools,
  "/product/[handle]": createProductTools(sampleProduct),
  "/search": createSearchTools(await getCollections()),
}));
```

The document served at `/.well-known/webmcp.json`:

```json
{
  "version": 1,
  "routes": [
    {
      "route": "/",
      "tools": [
        {
          "name": "search_products",
          "description": "Search the catalog by free-text query…",
          "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } },
          "annotations": { "readOnlyHint": true }
        }
      ]
    }
  ]
}
```

### `buildManifest(routes)`

The same document as an object, for tests or a custom handler. `inputSchema` comes from `z.toJSONSchema`
on each tool's `input`. Throws `NextWebMCPError` with code `TOOL_NAME_INVALID` if a `ToolDef` has no `name`
(use `defineTools`, which fills names from keys).

```ts
import { buildManifest } from "next-webmcp/manifest";
import { tools } from "@/app/tools";

const manifest = buildManifest({ "/": tools });
manifest.routes[0]?.tools.map((t) => t.name); // ["search_products", "start_checkout"]
```

## `next-webmcp/devtools`

### `<WebMCPDevTools position? defaultOpen? />`

```tsx
"use client";
import { WebMCPDevTools } from "next-webmcp/devtools";

export function DevTools() {
  return <WebMCPDevTools position="bottom-right" defaultOpen={false} />;
}
```

| Prop          | Type                                              | Default          |
| ------------- | ------------------------------------------------- | ---------------- |
| `position`    | `"bottom-right" \| "bottom-left"`                 | `"bottom-right"` |
| `defaultOpen` | `boolean`                                         | `false`          |
| `force`       | `boolean` — render in production too (demos only) | `false`          |

Tabs: **Tools** (live list grouped by route, JSON Schema toggle, "Copy prompt" that derives a natural-language
prompt from the schema), **Run** (JSON args → `document.modelContext.executeTool`, shows "navigated (null)"
when the tool navigated), **Calls** (`useToolCalls()`). Returns `null` when `NODE_ENV === "production"`
unless `force`. Inline styles only, zero dependencies. Override `--next-webmcp-offset` and
`--next-webmcp-z-index` to reposition it.

## `next-webmcp/internal`

Test-only: `__resetForTests()` clears the registry; `registry.getState()` / `registry.subscribe(cb)` expose
the store. Not covered by semver.

## FAQ

**Why not a generic React `useWebMCP` hook?**
Those hooks wrap `registerTool` well. next-webmcp is specific to Next.js: route `params`, `pathname`,
`searchParams` and `router` arrive in `ctx`; `execute` is meant to call server actions so the tool runs in
the user's session; `next/form` gets a declarative wrapper with `respondWith` and typed attributes;
`confirm` renders an approval card; the DevTools panel groups tools by route; and the manifest handler is
built from the same tool definitions.

**Does it work without a WebMCP-capable browser?**
Yes — `<ModelContext>` logs one `console.info` and does nothing. Your UI is unchanged.

**Can I use Zod 3?**
No. The peer range is `zod@^4` because JSON Schema conversion needs `z.toJSONSchema`. If a Zod without it is
installed anyway, `tool()` and `defineTools()` throw `NextWebMCPError` with code
`ZOD_TO_JSON_SCHEMA_UNSUPPORTED` when the tool is defined, so the problem surfaces at module load, not in
render.

**Why did my confirm tool fail with `CONFIRM_NO_RENDERER`?**
Something set `confirmations={false}` on the outermost `<ModelContext>` without mounting
`<ToolConfirmations />`, or the tool ran from a tree with no `<ModelContext>` at all. Mount the card, or
remove the override.

**What about the Pages Router or cross-origin iframes?**
Not yet; see the roadmap in the README.
