# next-web-mcp

[![npm](https://img.shields.io/npm/v/next-web-mcp.svg?label=npm)](https://www.npmjs.com/package/next-web-mcp)
[![CI](https://github.com/pane2004/next-webmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pane2004/next-webmcp/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Route-scoped [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools for the Next.js App Router.
Declare tools next to the segment that owns them, run them through the server actions you already have, in
the user's own session, and gate consequential ones behind an inline approval card. No extra server, no
OAuth, no second API surface.

- **Route-scoped** — tools register when a segment mounts and unregister when it unmounts. An agent on
  `/product/shoes` sees `add_to_cart`; an agent on `/` does not.
- **Server actions as `execute`** — the tool body is the same `"use server"` function your buttons call.
- **Validated on the server too** — `toolAction()` from `next-web-mcp/server` wraps the action with the
  same Zod schema and resolves to `{ ok, data | error }` instead of throwing.
- **Zod in, JSON Schema out** — `input: z.object(...)` becomes the tool's `inputSchema`.
- **Navigation from an allowlist** — `navigationTool()` builds a `navigate_to` tool from your route
  patterns; the agent can only open pages you listed.
- **Human-in-the-loop** — `confirm: true` shows an approve/deny card before the action runs. The card is
  rendered for you.
- **Declarative forms** — a `next/form` wrapper that answers agent submits with `respondWith`, with the
  `toolname` / `toolparamdescription` JSX attributes typed out of the box.
- **Manifest** — a route handler serves `/.well-known/webmcp.json` from the same tool definitions.
- **DevTools** — a dev-only panel built on `getTools()`, `toolchange`, and `executeTool()`.

## 30-second example

```ts
// app/schemas.ts — one schema for the tool and its action ("use server" files export only functions)
import { z } from "zod";

export const searchInput = z.object({
  query: z.string().min(1).describe("Free-text search, e.g. 'blue slip-on shoes'"),
  limit: z.number().int().min(1).max(20).default(10),
});
```

```ts
// app/actions.ts
"use server";
import { z } from "zod";
import { toolAction } from "next-web-mcp/server";
import { db } from "@/lib/db";
import { searchInput } from "./schemas";

// Validates again on the server; resolves to { ok: true, data } | { ok: false, error }, never throws.
export const searchProducts = toolAction(searchInput, ({ query, limit }) =>
  db.products.search(query, { limit }),
);
export const startCheckout = toolAction(z.object({}), () => db.cart.checkout()); // → { url, total }
```

```ts
// app/tools.ts
import { z } from "zod";
import { defineTools, navigationTool, tool, unwrap } from "next-web-mcp";
import { searchProducts, startCheckout } from "./actions";
import { searchInput } from "./schemas";

export const tools = defineTools({
  search_products: tool({
    description: "Search the catalog by free-text query. Returns up to `limit` products.",
    input: searchInput,
    annotations: { readOnlyHint: true },
    // unwrap() returns data, or throws the action's own sentence for the agent to read.
    execute: () => async (input) => unwrap(await searchProducts(input)),
  }),
  navigate_to: navigationTool({
    routes: [
      { path: "/", description: "Home page." },
      {
        path: "/product/[handle]",
        description: "A product page; adds add_to_cart.",
        params: z.object({ handle: z.string() }),
      },
    ],
  }),
  start_checkout: tool({
    title: "Start checkout",
    description: "Take the user to checkout for the current cart. Asks the user to approve first.",
    input: z.object({}),
    confirm: true,
    execute: (ctx) => async () => {
      const { url, total } = unwrap(await startCheckout({}));
      setTimeout(() => ctx.router.push(url), 0); // navigate after the result is returned
      return `Heading to checkout. Cart total: ${total}.`;
    },
  }),
});
```

```tsx
// app/providers.tsx
"use client";
import { ModelContext } from "next-web-mcp";
import { WebMCPDevTools } from "next-web-mcp/devtools";
import { tools } from "./tools";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelContext tools={tools}>
      {children}
      <WebMCPDevTools />
    </ModelContext>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Tool definitions hold Zod schemas and functions, which cannot cross the server → client boundary as props.
Import `tools` inside a `"use client"` module (as above) and render `<ModelContext>` there. The outermost
`<ModelContext>` also renders the approval card, so `confirm: true` works with nothing else mounted.

## Install

```sh
pnpm add next-web-mcp zod
```

Peer dependencies: `next >= 15`, `react >= 19`, `react-dom >= 19`, `zod ^4` (JSON Schema conversion uses
`z.toJSONSchema`; Zod 3 throws `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` at definition time). Node 22+.

## Concepts

### Route-scoped tools

`<ModelContext tools={...}>` is a client component. On mount it feature-detects `document.modelContext`,
converts each Zod schema with `z.toJSONSchema`, and calls `registerTool(tool, { signal })` once per tool, each
with its own `AbortController`. Unmounting aborts the signals, which is how WebMCP unregisters tools.

Registration is keyed by tool identity: `name`, `title`, `description`, the JSON Schema of `input`, and
`annotations` — the fields Chrome sees. Re-renders, new `tools` array identities, route changes, and factory
results with the same identity never re-register anything. Only a tool that appears, disappears, or changes
shape triggers a `registerTool` or an abort, and only for that tool. `execute` always runs the latest
definition with the route context (`pathname`, `params`, `searchParams`, `router`) read when the call
arrives, so a layout-level tool keeps working across navigation with no gap, and the DevTools route grouping
follows the URL.

Mount one `<ModelContext>` per segment that owns tools: the root layout can expose `get_cart`, and
`product/[handle]/page.tsx` can add `add_to_cart` that reads `ctx.params.handle`. Nested contexts add up, so
keep names unique across them. If two contexts register the same name, the registration that lands last wins
and a `TOOL_NAME_DUPLICATE` warning is logged once in development. Which one lands last depends on mount
order: when both mount in the same commit React runs the inner instance's effects first, so the outer
definition wins; an inner instance mounted in a later commit (after a client navigation) wins. Without
`document.modelContext` (SSR, other browsers) the component is a no-op that logs one `console.info`.

### Server actions as `execute`

`execute` is curried: `execute: (ctx) => async (input, { signal }) => ...`. The outer function receives the
route context (`params`, `pathname`, `searchParams`, `router`, `confirm`) as of the call; the inner function
receives validated input. Call server actions from it directly — they run with the user's cookies and
session, so an agent can only do what the signed-in user can do.

Every call goes through the same pipeline: `safeParseAsync` the input (invalid input returns
`Invalid input for <name>: … Fix the arguments and call again.`), ask for confirmation if `confirm` is set,
run the action, stringify object results, and turn thrown errors into
`<name> failed: <message>. Check the page state and try again.` — never a stack trace. Each call is
appended to a 200-entry log behind `useToolCalls()`.

Tools that navigate should return their string first and call `ctx.router.push()` afterwards (for example in
`setTimeout(..., 0)`): Chrome's `executeTool` resolves to `null` if a tool navigates before it returns.
`navigationTool({ routes })` does this for you: it builds a `navigate_to` tool whose `route` argument is an
enum of the App Router patterns you list (`"/product/[handle]"`), fills the `[segment]`s from `params` and
appends `query`, every value URL-encoded, returns `Navigating to <href>.` and pushes afterwards. The agent
cannot open a page you did not list.

### Validate on the server too

`<ModelContext>` checks a tool's arguments in the browser, but the browser is the agent's side of the
boundary: anything that reaches a server action can be forged. `toolAction(input, handler, options?)` from
`next-web-mcp/server` wraps the action with the same Zod schema, so the server parses the arguments again
(defaults and transforms applied), runs the handler, optionally checks the result against `options.output`,
and always resolves to a plain `ToolActionResult`: `{ ok: true, data }` or `{ ok: false, error }`. It never
throws — Next.js redacts thrown server-action errors in production, so an agent would only read "an error
occurred". Invalid input becomes `Invalid input: <path>: <message>; … Fix the arguments and call again.`; a
thrown handler error is logged with `console.error` and reported as `The action failed on the server. Try
again.` (or what `options.onError` returns); a result that fails `output` becomes
`The server returned an unexpected result.` Inside `execute`, `unwrap(result)` returns `data` or throws
`Error(error)`, which the pipeline above turns into `<name> failed: <error>. Check the page state and try
again.` — so the agent reads the server's own sentence. Keep the schema in a plain module both files import:
a `"use server"` file can only export async functions.

### Confirm gate

Set `confirm: true` to show a card with the tool's title and its arguments as a label/value table, or pass
`(input, ctx) => ConfirmRequest` to control the wording. The card has `role="dialog"` and
`aria-live="polite"`; Enter approves, Escape denies. Deny, a 60 s timeout, or an aborted signal all return
`User declined <name>.` to the agent without running the action.

The outermost `<ModelContext>` renders `<ToolConfirmations />` for you. Pass `confirmations={false}` to
place it yourself (it stays exported). If a tool asks for approval and nothing is mounted to show the card,
the call fails immediately with `CONFIRM_NO_RENDERER` instead of hanging — the agent receives
`<name> failed: [next-web-mcp] Tool "<name>" needs approval but no <ToolConfirmations/> is mounted. …` and a warning is
logged once in development.

### Declarative forms

`next-web-mcp/form` exports a `Form` that wraps `next/form`, sets `toolname`, `tooldescription` and
`toolautosubmit`, and answers agent submits by calling the `action` with the form's `FormData` and handing
the promise to `e.respondWith()`. Human submits are untouched. The package ships the JSX typings for
`toolname`, `tooldescription`, `toolautosubmit` (on `<form>`) and `toolparamdescription` (on `<input>`,
`<select>`, `<textarea>`), so no augmentation or cast is needed in your app.

```tsx
"use client";
import Form from "next-web-mcp/form";
import { subscribe } from "./actions"; // "use server"; (formData: FormData) => Promise<string>

export function NewsletterForm() {
  return (
    <Form
      action={subscribe}
      toolname="subscribe_newsletter"
      tooldescription="Subscribe an email address."
    >
      <input name="email" type="email" required toolparamdescription="Email address to subscribe" />
      <button type="submit">Subscribe</button>
    </Form>
  );
}
```

### Manifest

`next-web-mcp/manifest` turns the same `ToolDef[]` arrays into a JSON document agents can read before
loading a page. Serve it from a route handler:

```ts
// app/.well-known/webmcp.json/route.ts
import { createManifestHandler } from "next-web-mcp/manifest";
import { tools } from "../../tools";

export const GET = createManifestHandler({ "/": tools });
```

Keys are route patterns (`"/product/[handle]"`), values are tool arrays. The handler responds with
`application/json` and `Cache-Control: public, max-age=300`; pass a function (sync or async) when a route's
tools depend on data. The entry is server-safe — no React, no `"use client"`.

## API

Full reference with signatures and examples: **[docs/api.md](./docs/api.md)**.

| Import                  | Export                                 | Purpose                                                                                   |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `next-web-mcp`          | `tool(def)`                            | Identity helper that infers the input type from the Zod schema.                           |
|                         | `defineTools(map)`                     | Turns `{ name: tool(...) }` into `ToolDef[]`, filling `name` from keys.                   |
|                         | `<ModelContext>`                       | Registers `tools` for the lifetime of the mount; renders the confirm UI.                  |
|                         | `<ToolConfirmations>`                  | The approval card, for apps that pass `confirmations={false}`.                            |
|                         | `useToolCalls()`                       | Last 200 `ToolCallRecord`s, newest first.                                                 |
|                         | `useModelContextTools()`               | Live `RegisteredToolInfo[]` from `getTools()` + `toolchange`.                             |
|                         | `isModelContextAvailable()`            | Feature detection.                                                                        |
|                         | `NextWebMCPError`                      | `Error` with a stable `code`.                                                             |
|                         | `navigationTool(options)`              | A `navigate_to` tool from an allowlist of route patterns; pushes after returning.         |
|                         | `unwrap(result)`                       | `data` of a `ToolActionResult`, or throws its `error` for the agent to read.              |
| `next-web-mcp/server`   | `toolAction(input, handler, options?)` | Wraps a server action: validates input (and output), resolves to `{ ok, data \| error }`. |
| `next-web-mcp/form`     | `Form` (default)                       | `next/form` plus the WebMCP attributes; handles `respondWith`.                            |
| `next-web-mcp/manifest` | `createManifestHandler()`              | GET route handler for `/.well-known/webmcp.json`.                                         |
|                         | `buildManifest()`                      | The same document as a `WebMCPManifest` object.                                           |
| `next-web-mcp/devtools` | `<WebMCPDevTools>`                     | Tools / Run / Calls panel. Renders `null` in production.                                  |

`<ModelContext>` props: `tools: ToolDef[]`, `children?`, `confirmations?: boolean` (default `true`).
`ToolDef` fields: `name?`, `title?`, `description`, `input`, `annotations?`, `confirm?`, `execute`.

## Spec alignment

Chrome's WebMCP guidance, and where next-web-mcp implements it.

| Chrome rule                                                                                                      | next-web-mcp                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `document.modelContext` may be undefined; feature-detect.                                                        | `isModelContextAvailable()`; `<ModelContext>` no-ops with one `console.info`. Nothing touches `document` at module scope.       |
| Register with `registerTool(tool, { signal })`; abort the signal to unregister.                                  | One `AbortController` per tool; aborted when the tool is removed or changes identity, and on unmount. Navigation never aborts.  |
| Tool `name` is 1–128 ASCII alphanumerics, `_`, `-`, `.`.                                                         | Validated before registration → `TOOL_NAME_INVALID`.                                                                            |
| `inputSchema` is JSON Schema.                                                                                    | `z.toJSONSchema(def.input)`.                                                                                                    |
| `execute` should return a string (or serializable value).                                                        | Always a string: passthrough or `JSON.stringify`.                                                                               |
| Annotations `readOnlyHint` / `untrustedContentHint`.                                                             | Passed through verbatim; `consequentialHint` forwarded for newer builds.                                                        |
| Aborting does not cancel in-flight executions (Chrome 153+).                                                     | The tool's signal is forwarded as `opts.signal`; long actions can check `signal.aborted`.                                       |
| Same-name registration replaces the previous tool.                                                               | The `<ModelContext>` whose registration lands last wins (see Route-scoped tools); `TOOL_NAME_DUPLICATE` warning in development. |
| `getTools()` is alphabetized; `toolchange` fires on changes.                                                     | `useModelContextTools()` and the DevTools **Tools** tab subscribe to both.                                                      |
| `executeTool()` returns `null` if the tool navigates.                                                            | DevTools **Run** shows "navigated (null)"; docs tell tools to return first, then `router.push`.                                 |
| Declarative forms: `toolname`, `tooldescription`, `toolautosubmit`; `e.agentInvoked` + `e.respondWith(promise)`. | `next-web-mcp/form` sets the attributes and answers agent submits with the action's result.                                     |
| `toolactivated` / `toolcancel` window events carry `toolName`.                                                   | `Form` sets `data-tool-active` between them for styling.                                                                        |
| Ask before consequential actions.                                                                                | `confirm` + the approval card rendered by `<ModelContext>`.                                                                     |

## Testing your tools

1. **Chrome** — Chrome 149+ with `chrome://flags/#enable-webmcp-testing`, or a registered origin trial. The
   demo ships its token via a `<meta http-equiv="origin-trial">` tag in the root layout, so no flag is needed
   on `https://next-webmcp-commerce.vercel.app` (token valid until 2026-11-16).
2. **Model Context Tool Inspector** — Google's Chrome extension (linked from the WebMCP docs) lists registered
   tools and lets you call them with JSON arguments. `<WebMCPDevTools />` does the same inside your page.
3. **ChatGPT desktop browser** — supports WebMCP natively; open the site and ask it to complete a task.
4. **Without a browser that supports WebMCP** — `<ModelContext>` is a no-op. Use `next-web-mcp/internal`'s
   `__resetForTests()` and a fake `document.modelContext` in Vitest (see [`test/`](./test)).

### Verified against Chrome 150 (2026-09-04)

The library is exercised on the live demo with the origin-trial token, not only against the in-memory fake.
Three places where Chrome 150 differs from `webmcp-types@0.1.6`, and how `next-web-mcp` handles them:

| Chrome 150 behavior                                                                        | What the library does                                                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `document.modelContext.registerTool()` returns `undefined`, not a `Promise`                | Wraps the call in `Promise.resolve()` and a `try/catch`, so a failed registration never unmounts the tree |
| `execute(input)` is called with a single argument (no `{ signal }`)                        | Treats the per-call signal as optional and always merges it with the tool's own signal                    |
| `executeTool()` accepts only the `RegisteredTool` object from `getTools()`                 | The DevTools runner resolves the name to the object before calling                                        |
| `getTools()` returns `inputSchema` as a JSON string, `title` as `""`, and no `annotations` | `useModelContextTools()` parses string schemas and prefers the schema and annotations this app registered |

## Examples

### Commerce — [next-webmcp-commerce.vercel.app](https://next-webmcp-commerce.vercel.app)

[`examples/commerce`](./examples/commerce) is a fork of [vercel/commerce](https://github.com/vercel/commerce)
with a mock provider seeded from the Acme demo store, so it runs with no environment variables. `/learn`
shows the tools registered on the current page; `/.well-known/webmcp.json` serves the manifest.

| Route                             | Tools                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/` (root layout)                 | `search_products`, `get_cart`, `navigate_to`, `update_quantity`, `remove_item`, `start_checkout` (confirm) |
| `/product/[handle]`               | `get_product`, `add_to_cart`                                                                               |
| `/search`, `/search/[collection]` | `refine_results`                                                                                           |
| footer (all routes)               | `subscribe_newsletter` (declarative `<Form>`)                                                              |

Sample agent prompt:

> Find blue slip-on shoes in size 9 under $80 and add them to my cart, then start checkout.

Expected trace: `search_products` → `navigate_to` → `get_product` → `add_to_cart` → `start_checkout` (approval
card appears; the user clicks Approve).

### Minimal

[`examples/minimal`](./examples/minimal) is a todo list with three tools (`get_time`; `add_todo` with a
confirm card and a `toolAction` server action; `navigate_to` from `navigationTool`) and a manifest route
handler — the smallest complete setup.

[docs/EVAL.md](./docs/EVAL.md) defines five tasks run with WebMCP tools on vs. DOM-only. The methodology is
defined; no runs have been recorded yet, and no numbers appear here until they are.

## Repository layout

```
src/, test/            the next-web-mcp package (root of the repo; tsdown + vitest)
examples/commerce      demo storefront (Next.js App Router, mock provider) — deployed to Vercel
examples/minimal       smallest possible app: three tools (one from navigationTool), one confirm, manifest
docs/                  api.md (reference), API_CONTRACT (binding), IMPLEMENTATION_PLAN, SUBMISSION, EVAL
skills/                agent skill for adopting next-web-mcp in an existing app
```

Examples depend on `"next-web-mcp": "workspace:*"`, which pnpm links to the root package.

## Local development

```sh
pnpm install
pnpm build              # dist/ (tsdown)
pnpm test               # vitest with a fake document.modelContext
pnpm typecheck          # package; pnpm typecheck:examples for the examples
pnpm example:commerce   # http://localhost:3000, mock mode, no env vars
pnpm example:minimal
pnpm lint               # prettier --check .; pnpm format to fix
```

Build the package before running or typechecking the examples; they resolve `next-web-mcp` from `dist/`.

## Roadmap

- Flat `execute(input, ctx)` in place of the curried form.
- `ctx.navigate(url)`: navigate after the result is returned, without the `setTimeout` idiom.
- `"use tool"` directive with build-time discovery of tool files.
- Pages Router support.
- Cross-origin iframe tools (`exposedTo`).
- Structured (non-string) tool results once the spec stabilizes them.

## Prior art

- [usewebmcp](https://github.com/topics/webmcp) — React hooks around `registerTool`. next-web-mcp adds route
  scoping, server-action execution, confirm cards, `next/form`, DevTools, and the manifest.
- [webmcp-react](https://github.com/topics/webmcp) — component-level tool registration for React.
- [MCP-B](https://github.com/topics/mcp) — browser-side MCP servers exposed to extensions.

## License

[MIT](./LICENSE). `examples/commerce` is derived from vercel/commerce; see
[examples/commerce/LICENSE.vercel-commerce.md](./examples/commerce/LICENSE.vercel-commerce.md).
