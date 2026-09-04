---
name: next-webmcp-adoption
description: Adopt next-webmcp in an existing Next.js App Router app. Inventories server actions, picks a tool strategy per route, generates tools.ts files, mounts <ModelContext>, and verifies in Chrome. Use when asked to "make this app agent-ready", "add WebMCP tools", or "expose server actions to agents".
---

# Adopt next-webmcp in an existing App Router app

You are turning an existing Next.js App Router app into one that exposes route-scoped WebMCP tools. Work in
small, verifiable steps and keep the app's current UI untouched. The public API is documented in
`node_modules/next-webmcp/README.md` (or `packages/next-webmcp/README.md` in the monorepo); use only exports
listed there.

## Step 0 — Preconditions

- `next >= 15`, `react >= 19`, App Router (`app/` directory). Pages Router is not supported.
- Zod 4 (`zod >= 4`) for `z.toJSONSchema`. If the app is on Zod 3, upgrade or scope tools to a Zod 4 import.
- Install: `pnpm add next-webmcp zod` (or the app's package manager).

## Step 1 — Inventory server actions and routes

1. List every `"use server"` file and exported action: `grep -rl '"use server"' app lib`.
2. For each action note: route segment that uses it, input shape, whether it reads or writes, whether it is
   consequential (money, messages, deletion, account changes), and whether it navigates.
3. List route segments (`app/**/page.tsx`, `layout.tsx`) and the state each one owns (`params`, search params).

Produce a short table: `route | action | read/write | consequential | navigates`.

## Step 2 — Choose a tool strategy per route (Chrome's framework)

Chrome's WebMCP guidance distinguishes two APIs. Decide per candidate:

| Situation                                                                             | Use                                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| An existing `<form>` already does the job with a submit (newsletter, contact, filter) | Declarative: `next-webmcp/form` `Form` with `toolname` + `tooldescription` |
| Needs route context, structured JSON input, a computed result, or reads data          | Imperative: `tool()` inside `defineTools` mounted with `<ModelContext>`    |
| Consequential                                                                         | Imperative with `confirm`                                                  |
| Pure read                                                                             | Imperative with `annotations.readOnlyHint: true`                           |
| Returns third-party content                                                           | Add `annotations.untrustedContentHint: true`                               |

Rules of thumb:

- Tools model user tasks ("add this product to the cart"), not API endpoints ("POST /cart/lines").
- Scope tightly. `add_to_cart` belongs to `product/[handle]`, `get_cart` to the root layout.
- Keep each route to a handful of tools. Prefer one tool with a good schema over three overlapping ones.
- Names: `[A-Za-z0-9_.-]{1,128}`, snake_case verbs (`search_products`, `remove_item`).

## Step 3 — Generate `tools.ts` per segment

For each segment with tools, create `app/<segment>/tools.ts`:

```ts
import { z } from "zod";
import { defineTools, tool } from "next-webmcp";
import { addItem } from "./actions";

export const productTools = defineTools({
  add_to_cart: tool({
    title: "Add to cart",
    description:
      "Add a variant of the product on this page to the cart. Returns the new cart size.",
    input: z.object({
      variantId: z.string().describe("Variant id"),
      quantity: z.number().int().min(1).max(10).default(1),
    }),
    confirm: true,
    execute: (ctx) => async (input) => {
      const cart = await addItem(String(ctx.params.handle), input.variantId, input.quantity);
      ctx.router.refresh();
      return `Added ${input.quantity}. Cart has ${cart.totalQuantity} items.`;
    },
  }),
});
```

Checklist per tool:

- `description` states what it does and what it returns, in one or two sentences.
- Every schema field has `.describe()`.
- Read tools: `readOnlyHint: true`. Consequential tools: `confirm: true` or a `confirm` function.
- Tools that navigate return their string first, then `setTimeout(() => ctx.router.push(url), 0)`.
- Throw plain `Error("…")` for expected failures; the library formats it for the agent.

## Step 4 — Mount `<ModelContext>`

Tool definitions cannot cross the server → client prop boundary. Create a `"use client"` wrapper per segment:

```tsx
"use client";
import { ModelContext } from "next-webmcp";
import { productTools } from "./tools";

export function ProductTools({ children }: { children: React.ReactNode }) {
  return <ModelContext tools={productTools}>{children}</ModelContext>;
}
```

Wrap the segment's children in `layout.tsx` or `page.tsx` with it. In the root layout wrapper also render
`<ToolConfirmations />` (required for `confirm`) and `<WebMCPDevTools />` (renders `null` in production).

For declarative forms, replace `import Form from "next/form"` with `import Form from "next-webmcp/form"` and
add `toolname` and `tooldescription`; give inputs a `toolparamdescription` via spread:
`{...{ toolparamdescription: "…" }}`.

Optional: wrap `next.config.ts` with `withWebMCP(config, { manifest: { routes: [...] } })` to write
`public/.well-known/webmcp.json`.

## Step 5 — Verify in Chrome

1. `pnpm dev`, open the app in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.
2. Open the DevTools panel (bottom corner) or the Model Context Tool Inspector extension.
3. Confirm: the root tools are listed on `/`; segment tools appear when you navigate into the segment and
   disappear when you leave; each tool's JSON Schema matches the Zod schema.
4. In the Run tab call each tool with valid and invalid JSON. Invalid input must return
   `Invalid input for <name>: …`; a consequential tool must show the approval card; Escape must return
   `User declined <name>.`
5. Check the console: no `[next-webmcp]` warnings other than an expected `MODEL_CONTEXT_UNAVAILABLE` info in
   browsers without WebMCP.
6. Run `pnpm build` to make sure static pages still prerender (watch for `useSearchParams` Suspense warnings).

## Step 6 — Report

Summarize: routes touched, tools added (name, kind, confirm?), files created, and anything you could not
verify (for example if no WebMCP-capable browser was available). Do not claim tools work in Chrome unless you
observed them in the panel.
