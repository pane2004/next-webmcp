# next-webmcp

Route-scoped [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools for the Next.js App Router.
Your server actions become tools an agent can call in the user's own session, with Zod input validation, an
inline approval card for consequential actions, and a dev-only inspector.

```sh
pnpm add next-webmcp zod
```

Peers: `next >= 15`, `react >= 19`, `react-dom >= 19`, `zod ^4`. Node 20+.

## Quick start

1. Define tools next to the segment that owns them.

   ```ts
   // app/product/[handle]/tools.ts
   import { z } from "zod";
   import { defineTools, tool } from "next-webmcp";
   import { addToCart, getProduct } from "@/app/actions";

   export const productTools = defineTools({
     get_product: tool({
       description: "Return the product on this page: title, price, variants, availability.",
       input: z.object({}),
       annotations: { readOnlyHint: true },
       execute: (ctx) => async () => getProduct(String(ctx.params.handle)),
     }),
     add_to_cart: tool({
       title: "Add to cart",
       description: "Add a variant of the product on this page to the cart.",
       input: z.object({
         variantId: z.string().describe("Variant id from get_product"),
         quantity: z.number().int().min(1).max(10).default(1),
       }),
       confirm: (input) => ({
         title: "Add to cart",
         details: [
           { label: "Variant", value: input.variantId },
           { label: "Quantity", value: String(input.quantity) },
         ],
       }),
       execute: (ctx) => async (input) => {
         const cart = await addToCart(String(ctx.params.handle), input);
         ctx.router.refresh();
         return `Added ${input.quantity} × ${input.variantId}. Cart now has ${cart.totalQuantity} items.`;
       },
     }),
   });
   ```

2. Mount them from a client component.

   ```tsx
   // app/product/[handle]/product-tools.tsx
   "use client";
   import { ModelContext } from "next-webmcp";
   import { productTools } from "./tools";

   export function ProductTools({ children }: { children: React.ReactNode }) {
     return <ModelContext tools={productTools}>{children}</ModelContext>;
   }
   ```

3. Render the approval card and the DevTools once, in the root layout (through a client wrapper).

   ```tsx
   // app/providers.tsx
   "use client";
   import { ModelContext, ToolConfirmations } from "next-webmcp";
   import { WebMCPDevTools } from "next-webmcp/devtools";
   import { rootTools } from "./tools";

   export function Providers({ children }: { children: React.ReactNode }) {
     return (
       <ModelContext tools={rootTools}>
         {children}
         <ToolConfirmations />
         <WebMCPDevTools />
       </ModelContext>
     );
   }
   ```

Open the page in Chrome with `chrome://flags/#enable-webmcp-testing` (or an origin trial) and the DevTools
panel lists your tools per route.

## Entry points

| Import                 | Runs in              | Contents                                                                 |
| ---------------------- | -------------------- | ------------------------------------------------------------------------ |
| `next-webmcp`          | client               | `tool`, `defineTools`, `ModelContext`, `ToolConfirmations`, hooks, types |
| `next-webmcp/form`     | client               | `Form` — `next/form` with WebMCP attributes and `respondWith`            |
| `next-webmcp/devtools` | client, dev          | `WebMCPDevTools`                                                         |
| `next-webmcp/config`   | Node (`next.config`) | `withWebMCP`, manifest writer                                            |
| `next-webmcp/internal` | tests                | `__resetForTests`, `registry`                                            |

## API

### `tool(def)`

Identity function that infers the input type from the Zod schema so `execute` and `confirm` are typed.

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

`ToolDef` fields:

| Field          | Type                                                                     | Notes                                                       |
| -------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `name?`        | `string`                                                                 | `[A-Za-z0-9_.-]{1,128}`; defaults to the `defineTools` key. |
| `title?`       | `string`                                                                 | Used in confirm cards and DevTools.                         |
| `description`  | `string`                                                                 | Read by the agent. State what it does and what it returns.  |
| `input`        | `z.ZodTypeAny`                                                           | Converted with `z.toJSONSchema` (Zod 4).                    |
| `annotations?` | `{ readOnlyHint?, untrustedContentHint?, consequentialHint? }`           | Forwarded to Chrome.                                        |
| `confirm?`     | `boolean \| (input, ctx) => ConfirmRequest`                              | `true` builds a card from the title and the arguments.      |
| `execute`      | `(ctx: ToolContext) => (input, { signal }) => Promise<string \| object>` | Objects are `JSON.stringify`ed.                             |

`ToolContext`:

| Field          | Source                                                               |
| -------------- | -------------------------------------------------------------------- |
| `params`       | `useParams()`                                                        |
| `pathname`     | `usePathname()`                                                      |
| `searchParams` | `useSearchParams()` as `URLSearchParams`                             |
| `router`       | `useRouter()` from `next/navigation`                                 |
| `confirm`      | `(req, signal?) => Promise<boolean>` — the same gate `confirm:` uses |

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

### `<ModelContext tools children? />`

Registers `tools` on mount, aborts on unmount, re-registers when `pathname` or `params` change.
Nest freely; the later registration wins on name collisions (dev warning `TOOL_NAME_DUPLICATE`).

```tsx
"use client";
import { ModelContext } from "next-webmcp";
import { tools } from "./tools";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ModelContext tools={tools}>{children}</ModelContext>;
}
```

Execution pipeline per call:

1. `def.input.safeParse(raw)` — on failure the agent gets
   `Invalid input for <name>: <path>: <message>; … Fix the arguments and call again.`
2. `confirm` — `false`, a 60 s timeout, or an aborted signal returns `User declined <name>.`
3. `await def.execute(ctx)(parsed, { signal })` — strings pass through, objects are stringified.
4. Thrown errors become `<name> failed: <message>. Check the page state and try again.` No stack traces.
5. The call is appended to the 200-entry ring buffer behind `useToolCalls()`.

### `<ToolConfirmations />`

Renders the pending confirm card: fixed position, `role="dialog"`, `aria-live="polite"`, Enter approves,
Escape denies. Mount it once, anywhere under `<body>`.

```tsx
"use client";
import { ToolConfirmations } from "next-webmcp";

export function ConfirmHost() {
  return <ToolConfirmations />;
}
```

### `useToolCalls()`

```tsx
"use client";
import { useToolCalls } from "next-webmcp";

export function CallLog() {
  const calls = useToolCalls(); // newest first, max 200
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

### `isModelContextAvailable()`

```ts
import { isModelContextAvailable } from "next-webmcp";

if (isModelContextAvailable()) {
  // safe to touch document.modelContext
}
```

### `NextWebMCPError`

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

### `Form` — `next-webmcp/form`

`next/form` with the WebMCP declarative attributes. On an agent-initiated submit it calls the `action`
function with the form's `FormData` and hands the resulting promise to `e.respondWith()`. Human submits are
untouched. While the tool is active (`toolactivated` → `toolcancel`/submit) the element carries
`data-tool-active`.

```tsx
"use client";
import Form from "next-webmcp/form";
import { subscribe } from "./actions"; // "use server"; (formData: FormData) => Promise<void>

export function NewsletterForm() {
  return (
    <Form
      action={subscribe}
      toolname="subscribe_newsletter"
      tooldescription="Subscribe an email address to the newsletter."
    >
      <input
        name="email"
        type="email"
        required
        {...{ toolparamdescription: "Email address to subscribe" }}
      />
      <button type="submit">Subscribe</button>
    </Form>
  );
}
```

`toolparamdescription` is not in React's JSX types yet; the spread keeps TypeScript quiet and React 19 passes
the attribute to the DOM. `respond?: (result: unknown) => string` maps the action's return value to the string
sent to the agent (default `String(result ?? "Done")`). Note that `next/form` types `action` as returning
`void | Promise<void>`.

### `WebMCPDevTools` — `next-webmcp/devtools`

```tsx
"use client";
import { WebMCPDevTools } from "next-webmcp/devtools";

export function DevTools() {
  return <WebMCPDevTools position="bottom-right" defaultOpen={false} />;
}
```

Tabs: **Tools** (live, grouped by route, JSON Schema toggle, "Copy prompt"), **Run** (JSON args →
`document.modelContext.executeTool`, shows "navigated (null)" when the tool navigated), **Calls**
(`useToolCalls()`). Returns `null` when `NODE_ENV === "production"`. Inline styles only, zero dependencies.

### `withWebMCP` — `next-webmcp/config`

```ts
// next.config.ts
import type { NextConfig } from "next";
import { withWebMCP } from "next-webmcp/config";

const nextConfig: NextConfig = {};

export default withWebMCP(nextConfig, {
  manifest: {
    routes: [
      {
        route: "/",
        tools: [{ name: "get_time", description: "Return the current time as ISO-8601." }],
      },
    ],
  },
});
```

With `manifest`, `public/.well-known/webmcp.json` is written synchronously when the config loads
(`outFile` overrides the path). Without options the config is returned untouched. Never import this entry from
client code.

### `next-webmcp/internal`

Test-only: `__resetForTests()` clears the registry; `registry.getState()` / `registry.subscribe(cb)` expose the
store. Not covered by semver.

## Error codes

| `code`                           | Meaning                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `TOOL_NAME_INVALID`              | Name outside `[A-Za-z0-9_.-]{1,128}`.                                                                                      |
| `TOOL_NAME_DUPLICATE`            | Same name registered by two mounted contexts (dev warning; later wins).                                                    |
| `MODEL_CONTEXT_UNAVAILABLE`      | `document.modelContext` missing. One `console.info`; registration no-ops.                                                  |
| `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` | No `z.toJSONSchema` on the installed Zod (Zod 3). Thrown by `tool()`/`defineTools()` at definition time; upgrade to Zod 4. |
| `CONFIRM_TIMEOUT`                | No decision within 60 s; the agent receives `User declined <name>.`.                                                       |

## FAQ

**Why not `useWebMCP` from a generic React hook library?**
Those hooks wrap `registerTool` well. next-webmcp is specific to Next.js: route `params`, `pathname`,
`searchParams` and `router` arrive in `ctx`; `execute` is meant to call server actions so the tool runs in the
user's session; `next/form` gets a declarative wrapper with `respondWith`; `confirm` renders an approval card;
the DevTools panel groups tools by route; and `withWebMCP` writes a manifest from `next.config.ts`.

**Does it work without a WebMCP-capable browser?**
Yes — `<ModelContext>` logs one `console.info` and does nothing. Your UI is unchanged.

**Can I use Zod 3?**
No. The peer range is `zod@^4` because JSON Schema conversion needs `z.toJSONSchema`. If a Zod without it is
installed anyway, `tool()` and `defineTools()` throw `NextWebMCPError` with code
`ZOD_TO_JSON_SCHEMA_UNSUPPORTED` when the tool is defined, so the problem surfaces at module load, not in render.

**What about the Pages Router or cross-origin iframes?**
Not in v1.

## License

MIT
