# nextjs-webmcp

[![npm](https://img.shields.io/npm/v/nextjs-webmcp.svg?label=npm)](https://www.npmjs.com/package/nextjs-webmcp)
[![CI](https://github.com/pane2004/next-webmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pane2004/next-webmcp/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Route-scoped [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools for the Next.js App Router.
Declare tools next to the segment that owns them and run them through the server actions you already have,
in the user's own session. No extra server, no OAuth, no second API surface.

- **Route-scoped** — tools register when a segment mounts and unregister when it unmounts. An agent on
  `/product/shoes` sees `add_to_cart`; an agent on `/` does not.
- **Server actions as `execute`** — the tool body is the same `"use server"` function your buttons call.
- **Validated on the server too** — `toolAction()` from `nextjs-webmcp/server` wraps the action with the
  same Zod schema and resolves to `{ ok, data | error }` instead of throwing.
- **Zod in, JSON Schema out** — `input: z.object(...)` becomes the tool's `inputSchema`.
- **Navigation from an allowlist** — `navigationTool()` builds a `navigate_to` tool from your route
  patterns; the agent can only open pages you listed.
- **Declarative forms** — a `next/form` wrapper that answers agent submits with `respondWith`, with the
  `toolname` / `toolparamdescription` JSX attributes typed out of the box.
- **Manifest** — a route handler serves `/.well-known/webmcp.json` from the same tool definitions.
- **DevTools** — a dev-only panel built on `getTools()`, `toolchange`, and `executeTool()`.

## 30-second example

One server action, one tool, one mount.

```ts
// app/todo.ts — one schema for both sides ("use server" files can only export functions)
import { z } from "zod";
export const todoInput = z.object({ text: z.string().min(1).describe("What to do") });
```

```ts
// app/actions.ts
"use server";
import { toolAction } from "nextjs-webmcp/server";
import { todoInput } from "./todo";

export const addTodo = toolAction(todoInput, ({ text }) => db.todos.create({ text }));
```

```tsx
// app/layout.tsx
"use client";
import { ModelContext, defineTools, tool, unwrap } from "nextjs-webmcp";
import { addTodo } from "./actions";
import { todoInput } from "./todo";

const tools = defineTools({
  add_todo: tool({
    description: "Add a todo to the list.",
    input: todoInput,
    execute: () => async (input) => `Added todo #${unwrap(await addTodo(input)).id}.`,
  }),
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ModelContext tools={tools}>{children}</ModelContext>
      </body>
    </html>
  );
}
```

An agent in Chrome now sees `add_todo`, calls it with validated input, and the server action runs with
the user's session. Mount a second `<ModelContext>` inside any page for tools that should exist only there.
To keep the root layout a server component, move `tools` and the mount into a `"use client"` file.

## Install

```sh
npm i nextjs-webmcp zod
```

Peer dependencies: `next >= 15`, `react >= 19`, `react-dom >= 19`, `zod ^4` (JSON Schema conversion uses
`z.toJSONSchema`). Node 22+.

## Concepts

### Route-scoped tools

`<ModelContext tools={...}>` is a client component. On mount it converts each Zod schema to JSON Schema
and registers each tool with `document.modelContext`. Each tool gets its own `AbortController`. On unmount
the component aborts the signals, and the browser unregisters the tools.

A tool's identity is its `name`, `title`, `description`, input schema and `annotations`. A re-render, a new
`tools` array, or a route change does not register anything again. Only a tool that appears, disappears or
changes identity causes a registration or an abort. Each call reads the newest `execute` and the current
route context (`pathname`, `params`, `searchParams`, `router`), so a layout-level tool keeps working across
navigation.

Mount one `<ModelContext>` in each segment that owns tools. The root layout can expose `get_cart`, and
`product/[handle]/page.tsx` can add `add_to_cart`. Nested contexts add up, so keep names unique. If two
contexts register the same name, the last registration wins and development logs `TOOL_NAME_DUPLICATE` once.
The [API reference](./docs/api.md#modelcontext-tools-children-) explains which one lands last. Without
`document.modelContext` (SSR, other browsers) the component does nothing and logs one `console.info`.

### Server actions as `execute`

`execute` is curried: `execute: (ctx) => async (input, { signal }) => ...`. The outer function receives the
route context. The inner function receives validated input. Call server actions from it directly. They run
with the user's cookies and session, so an agent can do only what the signed-in user can do.

Every call follows the same steps:

1. Parse the input with the Zod schema. Invalid input returns a sentence that asks the agent to fix the
   arguments.
2. Run `execute`. An object result becomes JSON.
3. A thrown error becomes `<name> failed: <message>. Check the page state and try again.` The agent never
   sees a stack trace.
4. The call is added to the log behind `useToolCalls()`.

A tool that navigates must return its string first and navigate afterwards, for example in
`setTimeout(..., 0)`. If a tool navigates before it returns, Chrome's `executeTool` resolves to `null`.
`navigationTool({ routes })` does this for you. It builds a `navigate_to` tool from the App Router patterns
you list, fills the `[segment]`s from `params`, appends `query`, and URL-encodes every value. The agent
cannot open a page you did not list.

### Validate on the server too

`<ModelContext>` checks a tool's arguments in the browser. The browser is the agent's side of the boundary,
so a server action must not trust what it receives. `toolAction(input, handler, options?)` from
`nextjs-webmcp/server` wraps the action with the same Zod schema. The server parses the arguments again, runs
the handler, and can check the result against `options.output`.

`toolAction` never throws. It always resolves to `{ ok: true, data }` or `{ ok: false, error }`, because
Next.js redacts thrown server-action errors in production and an agent would read only "an error occurred".
Inside `execute`, `unwrap(result)` returns `data` or throws `Error(error)`. The pipeline above turns that
throw into `<name> failed: <error>`, so the agent reads the server's own sentence.

Keep the schema in a plain module that both files import. A `"use server"` file can export only async
functions.

### Declarative forms

`nextjs-webmcp/form` exports a `Form` that wraps `next/form`. It sets the `toolname`, `tooldescription` and
`toolautosubmit` attributes. When an agent submits the form, `Form` calls the `action` with the form's
`FormData` and hands the promise to `e.respondWith()`. A human submit works as before. The package ships the
JSX typings for these attributes and for `toolparamdescription` on `<input>`, `<select>` and `<textarea>`.

```tsx
"use client";
import Form from "nextjs-webmcp/form";
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

`nextjs-webmcp/manifest` turns the same `ToolDef[]` arrays into a JSON document that agents can read before
they load a page. Serve it from a route handler:

```ts
// app/.well-known/webmcp.json/route.ts
import { createManifestHandler } from "nextjs-webmcp/manifest";
import { tools } from "../../tools";

export const GET = createManifestHandler({ "/": tools });
```

Keys are route patterns such as `"/product/[handle]"`. Values are tool arrays. Pass a function, sync or
async, when a route's tools depend on data. The response is JSON with `Cache-Control: public, max-age=300`.
The entry is server-safe: no React and no `"use client"`.

## API

Full reference with signatures and examples: **[docs/api.md](./docs/api.md)**.

| Import                   | Export                                 | Purpose                                                                                   |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `nextjs-webmcp`          | `tool(def)`                            | Identity helper that infers the input type from the Zod schema.                           |
|                          | `defineTools(map)`                     | Turns `{ name: tool(...) }` into `ToolDef[]`, filling `name` from keys.                   |
|                          | `<ModelContext>`                       | Registers `tools` for the lifetime of the mount.                                          |
|                          | `useToolCalls()`                       | Last 200 `ToolCallRecord`s, newest first.                                                 |
|                          | `useModelContextTools()`               | Live `RegisteredToolInfo[]` from `getTools()` + `toolchange`.                             |
|                          | `isModelContextAvailable()`            | Feature detection.                                                                        |
|                          | `NextWebMCPError`                      | `Error` with a stable `code`.                                                             |
|                          | `navigationTool(options)`              | A `navigate_to` tool from an allowlist of route patterns; pushes after returning.         |
|                          | `unwrap(result)`                       | `data` of a `ToolActionResult`, or throws its `error` for the agent to read.              |
| `nextjs-webmcp/server`   | `toolAction(input, handler, options?)` | Wraps a server action: validates input (and output), resolves to `{ ok, data \| error }`. |
| `nextjs-webmcp/form`     | `Form` (default)                       | `next/form` plus the WebMCP attributes; handles `respondWith`.                            |
| `nextjs-webmcp/manifest` | `createManifestHandler()`              | GET route handler for `/.well-known/webmcp.json`.                                         |
|                          | `buildManifest()`                      | The same document as a `WebMCPManifest` object.                                           |
| `nextjs-webmcp/devtools` | `<WebMCPDevTools>`                     | Tools / Run / Calls panel. Renders `null` in production.                                  |

`<ModelContext>` props: `tools: ToolDef[]`, `children?`.
`ToolDef` fields: `name?`, `title?`, `description`, `input`, `annotations?`, `execute`.

## Spec alignment

Chrome's WebMCP guidance, and where nextjs-webmcp implements it.

| Chrome rule                                                                                                      | nextjs-webmcp                                                                                                                   |
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
| Declarative forms: `toolname`, `tooldescription`, `toolautosubmit`; `e.agentInvoked` + `e.respondWith(promise)`. | `nextjs-webmcp/form` sets the attributes and answers agent submits with the action's result.                                    |
| `toolactivated` / `toolcancel` window events carry `toolName`.                                                   | `Form` sets `data-tool-active` between them for styling.                                                                        |
| Ask before consequential actions.                                                                                | Do it in the server action, which runs with the user's session.                                                                 |

## Testing your tools

1. **Chrome** — Chrome 149+ with `chrome://flags/#enable-webmcp-testing`, or a registered origin trial. The
   demo ships its token via a `<meta http-equiv="origin-trial">` tag in the root layout, so no flag is needed
   on `https://next-webmcp-commerce.vercel.app` (token valid until 2026-11-16).
2. **Model Context Tool Inspector** — Google's Chrome extension (linked from the WebMCP docs) lists registered
   tools and lets you call them with JSON arguments. `<WebMCPDevTools />` does the same inside your page.
3. **ChatGPT desktop browser** — supports WebMCP natively; open the site and ask it to complete a task.
4. **Without a browser that supports WebMCP** — `<ModelContext>` is a no-op. Use `nextjs-webmcp/internal`'s
   `__resetForTests()` and a fake `document.modelContext` in Vitest (see [`test/`](./test)).

## Examples

### Commerce — [next-webmcp-commerce.vercel.app](https://next-webmcp-commerce.vercel.app)

[`examples/commerce`](./examples/commerce) is a fork of [vercel/commerce](https://github.com/vercel/commerce)
with a mock provider seeded from the Acme demo store, so it runs with no environment variables. `/learn`
shows the tools registered on the current page; `/.well-known/webmcp.json` serves the manifest.

| Route                             | Tools                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/` (root layout)                 | `search_products`, `get_cart`, `navigate_to`, `update_quantity`, `remove_item`, `start_checkout` |
| `/product/[handle]`               | `get_product`, `add_to_cart`                                                                     |
| `/search`, `/search/[collection]` | `refine_results`                                                                                 |
| footer (all routes)               | `subscribe_newsletter` (declarative `<Form>`)                                                    |

Sample agent prompt:

> Find blue slip-on shoes in size 9 under $80 and add them to my cart, then start checkout.

Expected trace: `search_products` → `navigate_to` → `get_product` → `add_to_cart` → `start_checkout`.

### Minimal

[`examples/minimal`](./examples/minimal) is a todo list with three tools (`get_time`; `add_todo` with a
`toolAction` server action; `navigate_to` from `navigationTool`) and a manifest route
handler — the smallest complete setup.

[docs/EVAL.md](./docs/EVAL.md) defines five tasks run with WebMCP tools on vs. DOM-only. The methodology is
defined; no runs have been recorded yet, and no numbers appear here until they are.

## Repository layout

```
src/, test/            the nextjs-webmcp package (root of the repo; tsdown + vitest)
examples/commerce      demo storefront (Next.js App Router, mock provider) — deployed to Vercel
examples/minimal       smallest possible app: three tools (one from navigationTool), manifest
docs/                  api.md (reference), EVAL.md (evaluation tasks)
skills/                agent skill for adopting nextjs-webmcp in an existing app
```

Examples depend on `"nextjs-webmcp": "workspace:*"`, which pnpm links to the root package.

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

Build the package before running or typechecking the examples; they resolve `nextjs-webmcp` from `dist/`.

## Roadmap

- Flat `execute(input, ctx)` in place of the curried form.
- `ctx.navigate(url)`: navigate after the result is returned, without the `setTimeout` idiom.
- `"use tool"` directive with build-time discovery of tool files.
- Pages Router support.
- Cross-origin iframe tools (`exposedTo`).
- Structured (non-string) tool results once the spec stabilizes them.

## Prior art

- [usewebmcp](https://github.com/topics/webmcp) — React hooks around `registerTool`. nextjs-webmcp adds route
  scoping, server-action execution, `next/form`, DevTools, and the manifest.
- [webmcp-react](https://github.com/topics/webmcp) — component-level tool registration for React.
- [MCP-B](https://github.com/topics/mcp) — browser-side MCP servers exposed to extensions.

## License

[MIT](./LICENSE). `examples/commerce` is derived from vercel/commerce; see
[examples/commerce/LICENSE.vercel-commerce.md](./examples/commerce/LICENSE.vercel-commerce.md).
