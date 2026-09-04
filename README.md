# next-webmcp

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/next-webmcp.svg?label=npm)](https://www.npmjs.com/package/next-webmcp)
[![CI](https://github.com/pane2004/next-webmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pane2004/next-webmcp/actions/workflows/ci.yml)

Route-scoped [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools for the Next.js App Router.
Declare tools next to the segment that owns them, run them through your existing server actions in the
user's own session, and gate consequential ones behind an inline approval card. No extra server, no OAuth,
no second API surface.

- **Route-scoped** — tools register when a segment mounts and unregister when it unmounts, so an agent on
  `/product/shoes` sees `add_to_cart` and an agent on `/` does not.
- **Server actions as `execute`** — the tool body is the same `"use server"` function your buttons call.
- **Zod in, JSON Schema out** — `input: z.object(...)` becomes the tool's `inputSchema`.
- **Human-in-the-loop** — `confirm: true` renders an approve/deny card before the action runs.
- **DevTools** — a dev-only panel built on `getTools()`, `toolchange`, and `executeTool()`.
- **Declarative forms** — a `next/form` wrapper that answers agent submits with `respondWith`.
- **Manifest** — optional `public/.well-known/webmcp.json` written from `next.config.ts`.

## 30-second example

```ts
// app/tools.ts
import { z } from "zod";
import { defineTools, tool } from "next-webmcp";
import { searchProducts, startCheckout } from "./actions";

export const tools = defineTools({
  search_products: tool({
    description: "Search the catalog by free-text query. Returns up to `limit` products.",
    input: z.object({
      query: z.string().min(1).describe("Free-text search, e.g. 'blue slip-on shoes'"),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    annotations: { readOnlyHint: true },
    execute: () => async (input) => searchProducts(input),
  }),
  start_checkout: tool({
    title: "Start checkout",
    description: "Take the user to checkout for the current cart. Asks the user to approve first.",
    input: z.object({}),
    confirm: true,
    execute: (ctx) => async () => {
      const { url, total } = await startCheckout();
      setTimeout(() => ctx.router.push(url), 0); // navigate after the result is returned
      return `Heading to checkout. Cart total: ${total}.`;
    },
  }),
});
```

```tsx
// app/providers.tsx
"use client";
import { ModelContext, ToolConfirmations } from "next-webmcp";
import { WebMCPDevTools } from "next-webmcp/devtools";
import { tools } from "./tools";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelContext tools={tools}>
      {children}
      <ToolConfirmations />
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
Import `tools` inside a `"use client"` module (as above) and render `<ModelContext>` there.

## Install

```sh
pnpm add next-webmcp zod
```

Peer dependencies: `next >= 15`, `react >= 19`, `react-dom >= 19`, `zod ^4` (JSON Schema conversion needs
`z.toJSONSchema`; see [Error codes](#error-codes) for what happens on Zod 3). Node 20+.

## How it works

`<ModelContext>` is a client component. On mount it feature-detects `document.modelContext`, converts each
Zod schema with `z.toJSONSchema`, and calls the browser API once per tool:

```ts
document.modelContext.registerTool(
  {
    name: "search_products",
    description: "Search the catalog by free-text query…",
    inputSchema: {
      /* JSON Schema from z.toJSONSchema(def.input) */
    },
    annotations: { readOnlyHint: true },
    async execute(rawInput, { signal }) {
      // 1. validate with def.input.safeParse → agent-readable error on failure
      // 2. if def.confirm → await ctx.confirm(request, signal) → "User declined …" on deny
      // 3. const result = await def.execute(ctx)(parsed, { signal })
      // 4. string → return as-is; object → JSON.stringify(result)
      // 5. catch → "<name> failed: <message>. Check the page state and try again."
    },
  },
  { signal: controller.signal },
);
```

One `AbortController` is created per `<ModelContext>` mount. Unmounting the segment aborts it, which is how
WebMCP unregisters tools. When `pathname` or route `params` change, the tools re-register so `ctx` is fresh.

Every execution is recorded in a small in-memory ring buffer (200 entries) that powers `useToolCalls()` and the
DevTools **Calls** tab.

## Concepts

### Route-scoped tools

Mount `<ModelContext tools={...}>` from a `"use client"` wrapper (like `Providers` above) in any segment's
`layout.tsx` or `page.tsx`. Tools live exactly as long as that segment is mounted. Nested contexts add up: the root layout can expose `get_cart`, and `product/[handle]/page.tsx` can add
`add_to_cart` that reads `ctx.params.handle`. If two contexts register the same name, the later one wins and a
`TOOL_NAME_DUPLICATE` warning is logged once in development.

### Server actions as `execute`

`execute` is curried: `execute: (ctx) => async (input, { signal }) => ...`. The outer function receives the route
context (`params`, `pathname`, `searchParams`, `router`, `confirm`); the inner function receives validated input.
Call server actions from it directly — they run with the user's cookies and session, so an agent can only do what
the signed-in user can do.

Tools that navigate should return their string first and call `ctx.router.push()` afterwards (for example in a
`setTimeout(..., 0)`): Chrome's `executeTool` resolves to `null` if a tool triggers navigation before it returns.

### Confirm gate

Set `confirm: true` to render a card with the tool's title and its arguments as a label/value table, or pass a
function `(input, ctx) => ConfirmRequest` to control the wording. `<ToolConfirmations />` renders the card
(`role="dialog"`, `aria-live="polite"`, Enter approves, Escape denies). Deny, a 60 s timeout, or an aborted
signal all return `User declined <name>.` to the agent without running the action.

## API reference

All exports are documented in [packages/next-webmcp/README.md](./packages/next-webmcp/README.md). Summary:

### `next-webmcp`

| Export                      | Kind      | Purpose                                                                  |
| --------------------------- | --------- | ------------------------------------------------------------------------ |
| `tool(def)`                 | function  | Identity helper that infers the input type from the Zod schema.          |
| `defineTools(map)`          | function  | Turns `{ name: tool(...) }` into `ToolDef[]`, filling `name` from keys.  |
| `<ModelContext>`            | component | Registers `tools` for the lifetime of the mount.                         |
| `<ToolConfirmations>`       | component | Renders pending confirm cards.                                           |
| `useToolCalls()`            | hook      | Last 200 `ToolCallRecord`s, newest first.                                |
| `useModelContextTools()`    | hook      | Live `RegisteredToolInfo[]` from `getTools()` + `toolchange`.            |
| `isModelContextAvailable()` | function  | `typeof document !== "undefined" && "modelContext" in document`.         |
| `NextWebMCPError`           | class     | `Error` with a `code` (see [error codes](#error-codes)).                 |
| Types                       | —         | `ToolDef`, `ToolContext`, `ToolAnnotations`, `ConfirmRequest`, and more. |

#### `<ModelContext>` props

| Prop       | Type              | Required | Notes                                       |
| ---------- | ----------------- | -------- | ------------------------------------------- |
| `tools`    | `ToolDef[]`       | yes      | Usually the result of `defineTools`.        |
| `children` | `React.ReactNode` | no       | Rendered unchanged; no context is required. |

#### `ToolDef` fields

| Field         | Type                                                           | Required | Notes                                                       |
| ------------- | -------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `name`        | `string`                                                       | no       | Defaults to the `defineTools` key. `[A-Za-z0-9_.-]{1,128}`. |
| `title`       | `string`                                                       | no       | Shown in confirm cards and DevTools.                        |
| `description` | `string`                                                       | yes      | What the agent reads. Say what it does and returns.         |
| `input`       | Zod schema                                                     | yes      | Converted with `z.toJSONSchema`.                            |
| `annotations` | `{ readOnlyHint?, untrustedContentHint?, consequentialHint? }` | no       | Passed through to Chrome.                                   |
| `confirm`     | `boolean \| (input, ctx) => ConfirmRequest`                    | no       | Human approval before `execute`.                            |
| `execute`     | `(ctx) => (input, { signal }) => Promise<string \| object>`    | yes      | Objects are `JSON.stringify`ed.                             |

### `next-webmcp/form`

| Export           | Kind      | Purpose                                                                                               |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `Form` (default) | component | `next/form` plus `toolname`, `tooldescription`, `toolautosubmit?`, `respond?`; handles `respondWith`. |

### `next-webmcp/devtools`

| Export             | Props                                                        | Purpose                                                  |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------- |
| `<WebMCPDevTools>` | `position?: "bottom-right" \| "bottom-left"`, `defaultOpen?` | Tools / Run / Calls panel. Renders `null` in production. |

### `next-webmcp/config`

| Export                          | Purpose                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `withWebMCP(nextConfig, opts?)` | Returns the config; with `opts.manifest` writes `public/.well-known/webmcp.json`. |

### Error codes

| `code`                           | When                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `TOOL_NAME_INVALID`              | Name is empty, longer than 128 chars, or contains characters outside `[A-Za-z0-9_.-]`.                                      |
| `TOOL_NAME_DUPLICATE`            | Two mounted contexts registered the same name (dev warning; later wins).                                                    |
| `MODEL_CONTEXT_UNAVAILABLE`      | `document.modelContext` is missing. Logged once with `console.info`; never thrown in render.                                |
| `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` | The installed Zod has no `z.toJSONSchema` (Zod 3). Thrown by `tool()`/`defineTools()` at definition time; upgrade to Zod 4. |
| `CONFIRM_TIMEOUT`                | No approve/deny within 60 s; the tool returns `User declined <name>.`.                                                      |

## Spec alignment

Chrome's WebMCP guidance, and where next-webmcp implements it.

| Chrome rule                                                                                                      | next-webmcp                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `document.modelContext` may be undefined; feature-detect.                                                        | `isModelContextAvailable()`; `<ModelContext>` no-ops with one `console.info`. Nothing touches `document` at module scope. |
| Register with `registerTool(tool, { signal })`; abort the signal to unregister.                                  | One `AbortController` per mount; aborted on unmount and before re-registration.                                           |
| Tool `name` is 1–128 ASCII alphanumerics, `_`, `-`, `.`.                                                         | Validated before registration → `TOOL_NAME_INVALID`.                                                                      |
| `inputSchema` is JSON Schema.                                                                                    | `z.toJSONSchema(def.input)`.                                                                                              |
| `execute` should return a string (or serializable value).                                                        | Always a string: passthrough or `JSON.stringify`.                                                                         |
| Annotations `readOnlyHint` / `untrustedContentHint`.                                                             | Passed through verbatim; `consequentialHint` forwarded for newer builds.                                                  |
| Aborting does not cancel in-flight executions (Chrome 153+).                                                     | The mount signal is forwarded as `opts.signal`; long actions can check `signal.aborted`.                                  |
| Same-name registration replaces the previous tool.                                                               | Later `<ModelContext>` wins; `TOOL_NAME_DUPLICATE` warning in development.                                                |
| `getTools()` is alphabetized; `toolchange` fires on changes.                                                     | `useModelContextTools()` and the DevTools **Tools** tab subscribe to both.                                                |
| `executeTool()` returns `null` if the tool navigates.                                                            | DevTools **Run** shows "navigated (null)"; docs tell tools to return first, then `router.push`.                           |
| Declarative forms: `toolname`, `tooldescription`, `toolautosubmit`; `e.agentInvoked` + `e.respondWith(promise)`. | `next-webmcp/form` sets the attributes and answers agent submits with the action's result.                                |
| `toolactivated` / `toolcancel` window events carry `toolName`.                                                   | `Form` sets `data-tool-active` between them for styling.                                                                  |
| Ask before consequential actions.                                                                                | `confirm` + `<ToolConfirmations />`.                                                                                      |

## Testing your tools

1. **Chrome** — Chrome 149+ with `chrome://flags/#enable-webmcp-testing`, or a registered origin trial. The demo
   ships its token via a `<meta http-equiv="origin-trial">` tag in the root layout, so no flag is needed on
   `https://next-webmcp-commerce.vercel.app` (token valid until 2026-11-16).
2. **Model Context Tool Inspector** — Google's Chrome extension (linked from the WebMCP docs) lists registered
   tools and lets you call them with JSON arguments. `<WebMCPDevTools />` does the same inside your page.
3. **ChatGPT desktop browser** — supports WebMCP natively; open the site and ask it to complete a task.
4. **Without a browser that supports WebMCP** — `<ModelContext>` is a no-op. Use `next-webmcp/internal`'s
   `__resetForTests()` and a fake `document.modelContext` in Vitest (see `packages/next-webmcp/test`).

### Verified against Chrome 150 (2026-09-04)

The library is exercised on the live demo with the origin-trial token, not only against the in-memory fake.
Three places where Chrome 150 differs from `webmcp-types@0.1.6`, and how `next-webmcp` handles them:

| Chrome 150 behavior                                                         | What the library does                                                                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `document.modelContext.registerTool()` returns `undefined`, not a `Promise` | Wraps the call in `Promise.resolve()` and a `try/catch`, so a failed registration never unmounts the tree |
| `execute(input)` is called with a single argument (no `{ signal }`)         | Treats the per-call signal as optional and always merges it with the mount signal                         |
| `executeTool()` accepts only the `RegisteredTool` object from `getTools()`  | The DevTools runner resolves the name to the object before calling                                        |

## Demo

Live: **https://next-webmcp-commerce.vercel.app** — a fork of [vercel/commerce](https://github.com/vercel/commerce)
with a mock provider seeded from the Acme demo store. `/learn` shows the tools registered on the current page.

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

## Eval

[docs/EVAL.md](./docs/EVAL.md) defines five tasks run under two conditions (WebMCP tools on vs. DOM-only) with a
fixed log format. As of 2026-09-03 the methodology is defined and **no runs have been recorded**; the results
table will be filled in from real logs only.

## Roadmap

- `"use tool"` directive with build-time discovery of tool files.
- Manifest generation from the same `defineTools` maps instead of hand-written route entries.
- Pages Router support.
- Cross-origin iframe tools (`exposedTo`).
- Structured (non-string) tool results once the spec stabilizes them.

## Prior art

- [usewebmcp](https://github.com/topics/webmcp) — React hooks around `registerTool`. next-webmcp adds route
  scoping, server-action execution, confirm cards, `next/form`, DevTools, and the manifest.
- [webmcp-react](https://github.com/topics/webmcp) — component-level tool registration for React.
- [MCP-B](https://github.com/topics/mcp) — browser-side MCP servers exposed to extensions.

## Monorepo layout

```
packages/next-webmcp   the library (tsdown, vitest)
apps/commerce          demo storefront (Next.js App Router, mock provider)
examples/minimal       smallest possible app: two tools, one confirm, manifest
docs/                  API_CONTRACT (binding), IMPLEMENTATION_PLAN, SUBMISSION, EVAL
skills/                agent skill for adopting next-webmcp in an existing app
```

## Local development

```sh
pnpm install
pnpm build          # builds packages/next-webmcp
pnpm dev            # apps/commerce → http://localhost:3000
pnpm test           # vitest for the library
pnpm typecheck      # every workspace
pnpm format:check   # prettier
```

The commerce app runs in mock mode with no environment variables.

## License

[MIT](./LICENSE). `apps/commerce` is derived from vercel/commerce; see
[apps/commerce/LICENSE.vercel-commerce.md](./apps/commerce/LICENSE.vercel-commerce.md).
