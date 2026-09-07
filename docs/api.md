# next-web-mcp API reference

Every public export, with its signature, behavior, and an example. For the pitch, the quick start, and the
spec-alignment table see the [README](../README.md).

```sh
pnpm add next-web-mcp zod
```

Peers: `next >= 15`, `react >= 19`, `react-dom >= 19`, `zod ^4`. Node 22+.

## Entry points

| Import                  | Runs in         | Contents                                                                                                         |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `next-web-mcp`          | client + server | `tool`, `defineTools`, `navigationTool`, `unwrap`, `ModelContext`, hooks, `NextWebMCPError`, types               |
| `next-web-mcp/server`   | server          | `toolAction` — validates a server action's input and output, returns `{ ok, data \| error }`; `ToolActionResult` |
| `next-web-mcp/form`     | client          | `Form` — `next/form` with the WebMCP attributes and `respondWith`; ships the JSX typings                         |
| `next-web-mcp/manifest` | server / Node   | `createManifestHandler`, `buildManifest`, manifest types                                                         |
| `next-web-mcp/devtools` | client, dev     | `WebMCPDevTools`                                                                                                 |
| `next-web-mcp/internal` | tests           | `__resetForTests`, `registry`                                                                                    |

`next-web-mcp/form` and `next-web-mcp/devtools` start with `"use client"`. `next-web-mcp/manifest` and
`next-web-mcp/server` import no React and can be used from route handlers, server actions, server components,
and scripts.

`next-web-mcp` itself is a plain barrel; each `"use client"` file keeps its own directive. So `tool`,
`defineTools`, `navigationTool`, `unwrap`, `NextWebMCPError` and `isModelContextAvailable` are real functions
on the server (a `tools.ts` that imports them can be shared between a page and the manifest route handler),
while `ModelContext` and the hooks stay client references.

## `next-web-mcp`

### `tool(def)`

Identity function that infers the input type from the Zod schema so `execute` is typed. Validates the name
(if given) and converts the schema eagerly, so a bad name or an unsupported Zod version fails at module load,
not in render.

```ts
import { z } from "zod";
import { tool } from "next-web-mcp";

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
| `title?`       | `string`                                                                 | Used in DevTools.                                           |
| `description`  | `string`                                                                 | Read by the agent. State what it does and what it returns.  |
| `input`        | `z.ZodTypeAny`                                                           | Converted with `z.toJSONSchema` (Zod 4).                    |
| `annotations?` | `{ readOnlyHint?, untrustedContentHint?, consequentialHint? }`           | Forwarded to Chrome.                                        |
| `execute`      | `(ctx: ToolContext) => (input, { signal }) => Promise<string \| object>` | Objects are `JSON.stringify`ed.                             |

`ToolContext`, passed to `execute(ctx)`:

| Field          | Source                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| `params`       | `useParams()` (`Record<string, string \| string[] \| undefined>`), as of the call |
| `pathname`     | `usePathname()`, as of the call                                                   |
| `searchParams` | `URLSearchParams` of the current URL, read when the tool runs                     |
| `router`       | `useRouter()` from `next/navigation`, as of the call                              |

The context is built when a call arrives, not when the tool is registered, so a tool registered by a layout
sees the route the user is on now.

### `defineTools(map)`

Turns a keyed object into `ToolDef[]`, filling `name` from the key when it is missing.

```ts
import { z } from "zod";
import { defineTools, tool } from "next-web-mcp";

export const tools = defineTools({
  get_cart: tool({
    description: "Return the current cart as JSON.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    execute: () => async () => ({ items: [], total: "0.00" }),
  }),
});
```

### `navigationTool(options)`

Builds a `ToolDef` (default name `navigate_to`) from an allowlist of App Router route patterns. The agent
picks a `route` from an enum of the patterns, supplies `params` for its `[segment]`s and an optional
`query`; the tool builds the href with every value `encodeURIComponent`-encoded, returns
`Navigating to <href>.`, and calls `router.push` (or `router.replace`) in `setTimeout(…, 0)` so Chrome's
`executeTool` receives the string. The href is same-origin by construction: only listed patterns are
accepted, and no value can escape its segment (`/`, `\`, `?`, `#` are encoded; catch-all values are split on
`/`, each piece encoded and empty pieces dropped, so `//host` cannot form). The tool has no `readOnlyHint`.

```ts
type NavigationRoute = {
  path: string; // "/", "/product/[handle]", "/docs/[...slug]", "/docs/[[...slug]]"
  description: string; // read by the agent
  params?: z.ZodObject<any>; // extra validation for the [segment] values; presence is always checked
  query?: z.ZodObject<any>; // validation for query; its keys are listed in the description
};

function navigationTool(options: {
  routes: NavigationRoute[]; // at least one
  name?: string; // default "navigate_to"
  description?: string; // leading sentence; default "Open another page of this site."
  replace?: boolean; // router.replace instead of router.push; default false
  scroll?: boolean; // forwarded to the router as { scroll } when set
}): ToolDef;
```

```ts
import { z } from "zod";
import { defineTools, navigationTool } from "next-web-mcp";

export const rootTools = defineTools({
  navigate_to: navigationTool({
    description: "Open another page of the store.",
    routes: [
      { path: "/", description: "Home page." },
      {
        path: "/search",
        description: "All products; add query q to search.",
        query: z.object({ q: z.string().optional() }),
      },
      {
        path: "/product/[handle]",
        description: "A product page; adds get_product and add_to_cart.",
        params: z.object({ handle: z.string().regex(/^[a-z0-9-]+$/) }),
      },
    ],
  }),
});
// Agent call: { route: "/product/[handle]", params: { handle: "acme-cup" } }
// → "Navigating to /product/acme-cup." then router.push("/product/acme-cup")
// Agent call: { route: "/search", query: { q: "blue shirt" } }
// → "Navigating to /search?q=blue+shirt."
```

Input schema handed to Chrome:

| Field     | Type                          | Notes                                                                          |
| --------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `route`   | enum of every `routes[].path` | Exactly as listed, e.g. `"/product/[handle]"`. Anything else fails validation. |
| `params?` | `Record<string, string>`      | One value per `[segment]`, keyed by segment name.                              |
| `query?`  | `Record<string, string>`      | Appended with `URLSearchParams`.                                               |

The description the agent reads is the leading sentence, then `Routes:` and one line per route:
`- <path> — <description>` followed by `Needs params: <names>.` for the non-optional segments,
`Optional params: <names>.` for `[[...name]]` segments, and `Query: <required keys>; optional: <keys>.`
when the route has a `query` schema. For the example above:

```
Open another page of the store.
Routes:
- / — Home page.
- /search — All products; add query q to search. Query: optional: q.
- /product/[handle] — A product page; adds get_product and add_to_cart. Needs params: handle.
```

Results, in the order they are checked:

| Situation                                                                        | Result                                                                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route` is not one of the patterns                                               | Through `<ModelContext>`: `Invalid input for <name>: route: …`. Called directly: `Unknown route "<route>". Available: /, /search, /product/[handle].` |
| A non-optional segment has no value (missing, empty, or a catch-all of only `/`) | `Route "<path>" needs params: <names>.`                                                                                                               |
| `params` fails `route.params`                                                    | `Invalid params for route "<path>": <field>: <message>; … Fix the arguments and call again.`                                                          |
| `query` fails `route.query` (an absent `query` is validated as `{}`)             | `Invalid query for route "<path>": <field>: <message>; … Fix the arguments and call again.`                                                           |
| Otherwise                                                                        | `Navigating to <href>.`, then `router.push(href)` / `router.replace(href)` — with `{ scroll }` when `scroll` is set — in `setTimeout(…, 0)`.          |

Routes without `params` / `query` schemas pass the values through unchecked apart from segment presence.
Throws `NextWebMCPError` with code `TOOL_NAME_INVALID` when `routes` is empty or `name` breaks Chrome's rule.
`navigationTool` is a real function on the server, so a `tools.ts` that uses it still loads in the manifest
route handler.

### `unwrap(result)`

Returns `result.data` of a [`ToolActionResult`](#next-web-mcpserver), or throws `Error(result.error)`.
Inside a tool's `execute` that throw becomes `<name> failed: <error>. Check the page state and try again.`,
so the agent reads the sentence the server action produced.

```ts
import { unwrap } from "next-web-mcp";
import { searchProducts } from "./actions"; // toolAction(...)

execute: () => async (input) => {
  const hits = unwrap(await searchProducts(input));
  // agent reads: "search_products failed: Invalid input: query: Too small: … Fix the arguments and call again."
  return hits.length ? JSON.stringify(hits) : `No products matched "${input.query}".`;
};
```

### `<ModelContext tools children? />`

Registers `tools` while mounted and unregisters them on unmount. Nest freely, but keep names unique across
instances. On a collision the registration that lands last wins (dev warning `TOOL_NAME_DUPLICATE`), and
which one lands last depends on mount order: when an outer and an inner instance mount in the same commit,
React runs the inner instance's effects first, so the outer definition wins; an inner instance mounted in a
later commit (for example after a client navigation) wins. Without `document.modelContext` it renders its
children and logs one `console.info`.

| Prop       | Type              | Default | Notes                                |
| ---------- | ----------------- | ------- | ------------------------------------ |
| `tools`    | `ToolDef[]`       | —       | Usually the result of `defineTools`. |
| `children` | `React.ReactNode` | —       | Rendered unchanged.                  |

```tsx
"use client";
import { ModelContext } from "next-web-mcp";
import { tools } from "./tools";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ModelContext tools={tools}>{children}</ModelContext>;
}
```

#### Registration is keyed by tool identity

A tool's identity is its `name`, `title`, `description`, the JSON Schema of `input`, and `annotations` — the
fields Chrome sees. `execute` is not part of it. `<ModelContext>` keeps one `AbortController`
per registered tool and diffs the `tools` array by name whenever it changes:

| Change                                                   | Effect                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| A name that was not registered                           | `registerTool` with a new controller for that tool                     |
| Same name, same identity                                 | Nothing                                                                |
| Same name, different identity (say, a new `description`) | Abort that tool's controller and register it again; siblings untouched |
| A name no longer in `tools`                              | Abort that tool's controller                                           |
| Unmount                                                  | Abort every controller                                                 |

Because the executor reads the current definition and route context when a call arrives, none of these
re-register anything, and none emit a `toolchange`:

- a re-render that passes a new array containing the same tools;
- a navigation that changes `pathname` or `params` — `ctx.pathname` and `ctx.params` are read at call time;
- a factory such as `createProductTools(product)` returning fresh definitions for a new `product` with the same
  names, descriptions, and schemas — the next call runs the new closure.

So a tool owned by a layout that stays mounted is never briefly missing while the user navigates. Building
tools from props with a factory inside `useMemo` is the recommended pattern; `useMemo` keeps the diff cheap
(the JSON Schema conversion is cached per Zod schema object) but a new array on every render is still
correct.

The `route` reported by `useModelContextTools()` and the DevTools **Tools** tab is the pathname the owning
`<ModelContext>` currently renders under; it follows navigation without touching `document.modelContext`.

Execution pipeline per call:

1. `await def.input.safeParseAsync(raw)` — async refinements work here too, so one schema can serve the tool
   and its `toolAction`; on failure the agent gets
   `Invalid input for <name>: <path>: <message>; … Fix the arguments and call again.`
2. `await def.execute(ctx)(parsed, { signal })` — the latest definition, the current route context, and the
   tool's own signal merged with the per-call one; strings pass through, objects are stringified.
3. Thrown errors become `<name> failed: <message>. Check the page state and try again.` No stack traces.
4. The call is appended to the 200-entry ring buffer behind `useToolCalls()`.

### `useToolCalls()`

Returns `ToolCallRecord[]`, newest first, at most 200 entries, and re-renders on every call. Works in
production.

```tsx
"use client";
import { useToolCalls } from "next-web-mcp";

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

Live list from `document.modelContext.getTools()`, refreshed on `toolchange`. Chrome 150 returns
`inputSchema` there as a JSON string and omits `annotations`; the hook parses string schemas and
prefers the schema and annotations this app registered, so `<WebMCPDevTools/>` always shows the real
definition. Tools registered by
`<ModelContext>` carry the `route` their owner currently renders under (it follows navigation); declarative
forms and other registrations do not.

```tsx
"use client";
import { useModelContextTools } from "next-web-mcp";

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
import { isModelContextAvailable } from "next-web-mcp";

if (isModelContextAvailable()) {
  // safe to touch document.modelContext
}
```

### `NextWebMCPError`

`Error` subclass with a stable `code` (`NextWebMCPErrorCode`). Messages are prefixed with `[next-web-mcp]`.

```ts
import { NextWebMCPError } from "next-web-mcp";

try {
  // ...
} catch (err) {
  if (err instanceof NextWebMCPError && err.code === "TOOL_NAME_INVALID") {
    // fix the name
  }
}
```

### Error codes

| `code`                      | Meaning                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `TOOL_NAME_INVALID`         | Name outside `[A-Za-z0-9_.-]{1,128}`, a `ToolDef` without a name reached `buildManifest`, or `navigationTool` was given no routes. |
| `TOOL_NAME_DUPLICATE`       | Same name registered by two mounted contexts (dev warning; later wins).                                                            |
| `MODEL_CONTEXT_UNAVAILABLE` | `document.modelContext` missing. One `console.info`; registration no-ops.                                                          |

### Types

`ToolDef`, `ToolContext`, `ToolAnnotations`, `ToolExecuteOptions`, `ToolCallRecord`,
`RegisteredToolInfo`, `ModelContextProps`, `NavigationRoute`, `ToolActionResult`, `NextWebMCPErrorCode`,
`AppRouterInstance`, `AnyZodSchema`.

## `next-web-mcp/form`

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
import Form from "next-web-mcp/form";
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

Importing `next-web-mcp/form` augments React's JSX types, so these attributes typecheck in any component of
your app — no `declare module "react"` block of your own:

| Element                             | Attributes                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `<form>`                            | `toolname?: string`, `tooldescription?: string`, `toolautosubmit?: boolean \| ""` |
| `<input>`, `<select>`, `<textarea>` | `toolparamdescription?: string`                                                   |

On a plain `<form>` write `toolautosubmit=""`, not `toolautosubmit` — React drops `true` for custom
attributes, so the attribute never reaches the DOM. `Form` from `next-web-mcp/form` takes a boolean and sets it
correctly.

The augmentation is part of `dist/form.d.ts`. If your app already declares the same augmentation, delete it;
the two would conflict only if the types differ.

## `next-web-mcp/manifest`

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
import { createManifestHandler } from "next-web-mcp/manifest";
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
import { buildManifest } from "next-web-mcp/manifest";
import { tools } from "@/app/tools";

const manifest = buildManifest({ "/": tools });
manifest.routes[0]?.tools.map((t) => t.name); // ["search_products", "start_checkout"]
```

## `next-web-mcp/server`

The server side of a tool. Server-safe: no React, no `"use client"`, nothing that reads `document` or
`window`. Import it from `"use server"` files.

```ts
type ToolActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type ToolActionOptions<R> = {
  /** Checks the handler's result; on success the parsed value is returned (unknown keys stripped). */
  output?: z.ZodType<R>;
  /** Maps a thrown error to the sentence the agent reads. Default: a generic sentence, never the message. */
  onError?: (error: unknown) => string;
};

function toolAction<S extends z.ZodTypeAny, R>(
  input: S,
  handler: (input: z.infer<S>) => Promise<R> | R,
  options?: ToolActionOptions<R>,
): (raw: unknown) => Promise<ToolActionResult<R>>;
```

### `toolAction(input, handler, options?)`

Wraps a server action so it validates its input on the server, never throws, and always resolves to a
plain, serializable `ToolActionResult`. The returned async function is the action: export it from a
`"use server"` file and call it from a tool's `execute` through [`unwrap`](#unwrapresult), or from a form.

```ts
// app/actions.ts
"use server";
import { z } from "zod";
import { toolAction } from "next-web-mcp/server";
import { searchInput } from "./schemas"; // the tool's input schema, in a plain module

export const searchProducts = toolAction(
  searchInput,
  async ({ query, limit }) => db.products.search(query, { limit }),
  { output: z.array(z.object({ handle: z.string(), title: z.string() })) },
);

export const addToCart = toolAction(
  z.object({ sku: z.string() }),
  async ({ sku }) => cart.add(sku),
  {
    onError: (err) =>
      err instanceof OutOfStock ? `${err.sku} is out of stock.` : "Could not add it.",
  },
);
```

| Step                                    | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input.safeParseAsync(raw)` fails       | `{ ok: false, error: "Invalid input: <path>: <message>; … Fix the arguments and call again." }` — the same wording `<ModelContext>` uses, `(root)` when an issue has no path (e.g. `Invalid input: (root): Invalid input: expected object, received string. Fix the arguments and call again.`). The handler does not run.                                                                                                                                                                       |
| The handler throws                      | `console.error(err)`, then `{ ok: false, error: onError?.(err) ?? "The action failed on the server. Try again." }`. The thrown message is never returned by default — Next.js redacts it in production anyway, and a result keeps the wording yours in development too. If `onError` itself throws, that error is logged and the generic sentence is used. A `.transform` or `.refine` body in `input` or `output` that throws a non-Zod error takes the same path, so the action never rejects. |
| `output` is set and the result fails it | `console.error("[next-web-mcp] toolAction: the handler's result failed the output schema: <path>: <message>; …")`, then `{ ok: false, error: "The server returned an unexpected result." }`.                                                                                                                                                                                                                                                                                                     |
| Otherwise                               | `{ ok: true, data }` — the `output`-parsed value when `output` is set, else the handler's return value.                                                                                                                                                                                                                                                                                                                                                                                          |

Defaults and transforms in `input` apply (`safeParseAsync`, so async refinements work too). Because the
result is a plain object, it crosses the server-action boundary unchanged; `unwrap` turns a failure into
the throw that `<ModelContext>` formats for the agent.

Why a schema module: a `"use server"` file can only export async functions, and `tools.ts` importing
`actions.ts` importing `tools.ts` would be a cycle, so put the shared Zod schema in a plain module
(`app/schemas.ts`, `lib/tool-schemas.ts`) that both import.

Using it behind a form action:

```ts
"use server";
const subscribeAction = toolAction(
  z.object({ email: z.string().email() }),
  async ({ email }) => `Subscribed ${email}.`,
);

export async function subscribe(formData: FormData): Promise<string> {
  const result = await subscribeAction({ email: formData.get("email") });
  return result.ok ? result.data : result.error; // both are sentences the agent (and the visitor) can read
}
```

## `next-web-mcp/devtools`

### `<WebMCPDevTools position? defaultOpen? />`

```tsx
"use client";
import { WebMCPDevTools } from "next-web-mcp/devtools";

export function DevTools() {
  return <WebMCPDevTools position="bottom-right" defaultOpen={false} />;
}
```

| Prop          | Type                                              | Default          |
| ------------- | ------------------------------------------------- | ---------------- |
| `position`    | `"bottom-right" \| "bottom-left"`                 | `"bottom-right"` |
| `defaultOpen` | `boolean`                                         | `false`          |
| `force`       | `boolean` — render in production too (demos only) | `false`          |

Tabs: **Tools** (live list grouped by route, JSON Schema toggle), **Run** (JSON args → `document.modelContext.executeTool`, shows "navigated (null)"
when the tool navigated), **Calls** (`useToolCalls()`). Returns `null` when `NODE_ENV === "production"`
unless `force`. Inline styles only, zero dependencies. Override `--next-web-mcp-offset` and
`--next-web-mcp-z-index` to reposition it.

## `next-web-mcp/internal`

Test-only: `__resetForTests()` clears the registry; `registry.getState()` / `registry.subscribe(cb)` expose
the store. Not covered by semver.

## FAQ

**Why not a generic React `useWebMCP` hook?**
Those hooks wrap `registerTool` well. next-web-mcp is specific to Next.js: route `params`, `pathname`,
`searchParams` and `router` arrive in `ctx`; `execute` is meant to call server actions so the tool runs in
the user's session; `next/form` gets a declarative wrapper with `respondWith` and typed attributes;
the DevTools panel groups tools by route; and the manifest handler is
built from the same tool definitions.

**Do my tools re-register when I navigate or re-render?**
No. Registration is keyed by tool identity (name, title, description, input schema, annotations), and the
executor reads the latest definition and route context at call time. A re-render, a new `tools` array, a
`pathname`/`params` change, or a factory returning new closures with the same identity leaves the registration
untouched. Only adding, removing, or reshaping a tool touches `document.modelContext`, and only for that tool.

**Why validate on the server when `<ModelContext>` already did?**
The browser-side check produces good error messages for the agent, but it runs in the agent's own
environment; a server action can be called with any payload. `toolAction` re-parses with the same schema on
the server and returns `{ ok, data | error }` instead of throwing, so the server's verdict reaches the agent
as a sentence (`unwrap` rethrows it inside `execute`) rather than the redacted error Next.js shows for thrown
server-action errors in production.

**Does it work without a WebMCP-capable browser?**
Yes — `<ModelContext>` logs one `console.info` and does nothing. Your UI is unchanged.

**Can I use an older Zod?**
No. The peer range is `zod@^4` because JSON Schema conversion needs `z.toJSONSchema`; without it `tool()` and
`defineTools()` fail when the tool is defined, so the problem surfaces at module load, not in render.

**What about the Pages Router or cross-origin iframes?**
Not yet; see the roadmap in the README.
