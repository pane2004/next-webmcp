# next-webmcp — implementation plan

Status date: **2026-09-03**. Hackathon deadline: **2026-09-04 01:00 PDT**. Origin trial for
`https://next-webmcp-commerce.vercel.app` expires **2026-11-16**.

The binding API is [API_CONTRACT.md](./API_CONTRACT.md). This document explains how the pieces fit, what
each behavior must do to be accepted, and the order of work.

## 1. Architecture

```
                 next.config.ts ──withWebMCP──▶ public/.well-known/webmcp.json   (build time, Node)

  Browser (client components)
  ┌────────────────────────────────────────────────────────────────────────┐
  │ <ModelContext tools>  ──registerTool(tool, {signal})──▶ document.modelContext
  │   • one AbortController per mount                                       │
  │   • Zod → JSON Schema (z.toJSONSchema)                                  │
  │   • execute pipeline: parse → confirm → server action → stringify       │
  │   • ctx = { params, pathname, searchParams, router, confirm }           │
  │                                                                         │
  │ registry (module store, useSyncExternalStore)                           │
  │   • tool → route map     • pending confirmations   • call ring buffer   │
  │        ▲                        ▲                        ▲              │
  │ useModelContextTools     <ToolConfirmations/>       useToolCalls        │
  │        └──────────── <WebMCPDevTools/> (Tools / Run / Calls) ───────────┘
  │                                                                         │
  │ <Form toolname tooldescription action={serverAction}>  ── respondWith ──▶ agent
  └────────────────────────────────────────────────────────────────────────┘
                     │ server actions (user's cookies/session)
                     ▼
               Next.js server
```

Principles:

- The tool body is a server action. No extra HTTP surface, no OAuth: an agent can only do what the signed-in
  user can do.
- Everything is route-scoped through React lifecycles. Registration is a side effect of mounting.
- The browser API is optional. Missing `document.modelContext` is a logged no-op, never a thrown error.
- Zero runtime dependencies beyond peers. Inline styles only in UI components.

## 2. Package layout

```
packages/next-webmcp/
  src/index.ts        "use client" — tool, defineTools, ModelContext, ToolConfirmations, hooks, errors, types
  src/form.tsx        "use client" — Form (next/form wrapper)
  src/devtools.tsx    "use client" — WebMCPDevTools (returns null in production)
  src/config.ts       Node — withWebMCP + manifest writer (sync node:fs)
  src/internal.ts     __resetForTests, registry
  test/               vitest + jsdom with a fake document.modelContext
  tsdown.config.ts    ESM, dts, banner "use client" on client entries
apps/commerce/        demo (vercel/commerce fork, mock provider, tools per route, /learn)
examples/minimal/     two tools + confirm + manifest on a fresh create-next-app
docs/                 contract, this plan, submission, eval
skills/               adoption skill for coding agents
```

## 3. Behaviors and acceptance criteria

| ID  | Behavior                    | Acceptance criteria                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Feature detection           | `isModelContextAvailable()` is false in SSR and in browsers without WebMCP. `<ModelContext>` renders children, logs `[next-webmcp] document.modelContext is unavailable…` once via `console.info`, and never throws. No module-scope `document`/`window`.                                                                                 |
| B2  | Route-scoped registration   | On mount each tool is passed to `registerTool` with the mount's `AbortController.signal`. Unmount aborts. Changing `pathname` or serialized `params` aborts and re-registers so `ctx` is fresh. Test: mount → `getTools()` has N tools; unmount → 0.                                                                                      |
| B3  | Zod → JSON Schema           | `inputSchema = z.toJSONSchema(def.input)`, converted eagerly in `tool()`/`defineTools()` and cached per schema. Missing `z.toJSONSchema` throws `NextWebMCPError("ZOD_TO_JSON_SCHEMA_UNSUPPORTED")` at definition time, not in render. Test stubs `zod.toJSONSchema` to `undefined`.                                                      |
| B4  | Validation + agent errors   | Invalid input returns `Invalid input for <name>: <path>: <message>; … Fix the arguments and call again.` Thrown errors return `<name> failed: <message>. Check the page state and try again.` No stack traces in results.                                                                                                                 |
| B5  | Server actions as `execute` | `execute(ctx)(input, { signal })` runs with `ctx = { params, pathname, searchParams, router, confirm }`. String results pass through; objects are `JSON.stringify`ed. Test: a fake action receives parsed input; the result is a string.                                                                                                  |
| B6  | Confirm gate                | `confirm: true` → card with `title ?? name` and args as label/value rows; function form → custom `ConfirmRequest`. Deny, 60 s timeout, or aborted signal → `User declined <name>.` and the action is not called. Card has `role="dialog"`, `aria-live="polite"`, Enter/Escape.                                                            |
| B7  | Call log                    | Every execution appends `{ id, name, route, args, startedAt, durationMs, result, ok }` to a 200-entry ring buffer. `useToolCalls()` returns newest first and re-renders subscribers. Works in production.                                                                                                                                 |
| B8  | Live tool list              | `useModelContextTools()` reads `getTools()` on mount and on every `toolchange`. Entries registered by us carry `route`; others have `route: undefined`.                                                                                                                                                                                   |
| B9  | DevTools panel              | `WebMCPDevTools` returns `null` when `NODE_ENV === "production"` unless `force`. Tabs: Tools (grouped by route, schema toggle, Copy prompt), Run (`executeTool`, shows "navigated (null)"), Calls. Inline styles; no dependencies.                                                                                                        |
| B10 | Declarative `Form`          | Renders `next/form` with `toolname`, `tooldescription`, `toolautosubmit`. When `nativeEvent.agentInvoked` is true: `preventDefault()`, run the function `action` with `new FormData(form)`, pass `respond(result)` to `respondWith`. String `action` → native submit. `data-tool-active` between `toolactivated` and `toolcancel`/submit. |
| B11 | Config + manifest           | `withWebMCP(config)` returns `config` unchanged. With `manifest`, writes `public/.well-known/webmcp.json` (or `outFile`) synchronously at config-load time. No `server-only` import.                                                                                                                                                      |

Cross-cutting: dev `console.warn` once for `TOOL_NAME_DUPLICATE`; `TOOL_NAME_INVALID` for names outside
`[A-Za-z0-9_.-]{1,128}`; tools that navigate return first and push in a later task (documented, app-owned).

## 4. Demo tools (apps/commerce)

| Route                             | Tool                   | Kind                        | Server action / behavior                              |
| --------------------------------- | ---------------------- | --------------------------- | ----------------------------------------------------- |
| `/` (root layout)                 | `search_products`      | readOnly                    | product search, returns handle/title/price/variants   |
| `/`                               | `get_cart`             | readOnly                    | current cart lines and totals                         |
| `/`                               | `navigate_to`          | navigation                  | returns first, then `router.push(path)`               |
| `/`                               | `update_quantity`      | mutation                    | `updateItemQuantity`                                  |
| `/`                               | `remove_item`          | mutation                    | `removeItem`                                          |
| `/`                               | `start_checkout`       | **confirm**                 | checkout URL, then push after returning               |
| `/product/[handle]`               | `get_product`          | readOnly, uses `ctx.params` | product by handle                                     |
| `/product/[handle]`               | `add_to_cart`          | mutation, uses `ctx.params` | `addItem(variantId, quantity)`                        |
| `/search`, `/search/[collection]` | `refine_results`       | navigation (search params)  | pushes `?q=&sort=` and returns the new result count   |
| footer (all routes)               | `subscribe_newsletter` | declarative `<Form>`        | server action returning void; `respondWith("Done")`   |
| `/learn`                          | —                      | page                        | shows `useModelContextTools()` live with route labels |

The root layout also emits `<meta http-equiv="origin-trial" content={WEBMCP_ORIGIN_TRIAL_TOKEN}>` from
`apps/commerce/lib/webmcp-origin-trial.ts`.

## 5. Build order

- [x] Scaffold pnpm monorepo, vendor vercel/commerce, MIT license — commit `ad54f38`
- [x] Public API contract (`docs/API_CONTRACT.md`) with verified Chrome spec facts
- [~] Library `src/` (B1–B9) — in progress, concurrent agent, 2026-09-03
- [~] `form.tsx` (B10) and `config.ts` (B11) — in progress
- [~] Vitest suite with fake `document.modelContext` — in progress
- [~] Commerce mock provider seeded from the Acme demo store — in progress
- [~] Commerce tools per route + `/learn` + origin-trial meta — in progress
- [x] Docs and repo infrastructure (READMEs, plan, submission, eval, CI, changesets, example, skill) — this change
- [ ] `pnpm build && pnpm typecheck && pnpm test` green on CI (Node 20 and 22)
- [ ] Deploy `apps/commerce` to https://next-webmcp-commerce.vercel.app and verify tools without a flag
- [ ] Run the eval protocol and fill `docs/EVAL.md` from real logs
- [ ] Record the < 3 min video (`docs/SUBMISSION.md` script)
- [ ] Publish `next-webmcp@0.1.0` to npm (changeset present)

## 6. Risks and open questions

| Risk                                       | Detail                                                                                                                                                   | Mitigation                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `respondWith` + React forms                | React 19 owns form submission; `next/form` may intercept before our `onSubmit`. `e.nativeEvent.respondWith` must be called synchronously in the handler. | Call `preventDefault()` and `respondWith()` inside `onSubmit` before any async work; verify in Chrome.                           |
| `executeTool` returns `null` on navigation | Tools that `router.push` before returning lose their result.                                                                                             | Documented rule: return the string, then push in `setTimeout(…, 0)`. DevTools shows "navigated (null)".                          |
| Zod 3 fallback                             | Zod 3.x has no `z.toJSONSchema` on its root export.                                                                                                      | Peer range is `zod@^4`; `tool()`/`defineTools()` throw `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` at definition time with an upgrade hint. |
| ChatGPT browser availability               | Native WebMCP support in the ChatGPT desktop browser cannot be verified on every judge's machine.                                                        | Origin trial covers Chrome without a flag; DevTools Run tab works with no external agent at all.                                 |
| `useSearchParams` in `<ModelContext>`      | Reading search params in a client component can bail a static page out to CSR unless isolated in a Suspense boundary.                                    | Keep the hook in a leaf component wrapped in `<Suspense>` inside `ModelContext`; verify with `next build` on the example.        |
| In-flight executions after abort           | Chrome 153+ does not cancel running `execute` calls when the signal aborts.                                                                              | Forward the mount signal; long actions check `signal.aborted` before side effects.                                               |
| Origin trial expiry                        | Token stops working 2026-11-16 (Chrome 149–156).                                                                                                         | Documented; re-register or rely on the flag after that date.                                                                     |

## 7. Engineering standards

- [ ] TypeScript strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; no `any` in the public API
- [ ] `"use client"` as the first line of every client entry (tsdown banner enforces it on `dist`)
- [ ] No `document`/`window` access at module scope
- [ ] JSDoc with `@example` and `@see` on every public export
- [ ] Small single-purpose modules; conventions modeled on next-intl, nuqs, next-safe-action
- [ ] Prettier (`printWidth: 100`, double quotes, trailing commas) — `pnpm format:check`
- [ ] Vitest with jsdom; tests never depend on a real browser
- [ ] Changeset for every user-visible change

## 8. Definition of done

- CI green on Node 20 and 22: prettier, typecheck, tests, library build, commerce build (mock, no env).
- Demo deployed; opening `https://next-webmcp-commerce.vercel.app` in Chrome 149+ lists the root tools in the
  Model Context Tool Inspector without any flag.
- The sample prompt (search → open product → add to cart → checkout with approval) succeeds end-to-end in
  Chrome with the DevTools panel showing the tool swap on navigation.
- `docs/EVAL.md` results section filled from real runs, or explicitly left at "0 runs".
- `next-webmcp@0.1.0` publishable: `pnpm --filter next-webmcp build` produces `dist/` with types and the
  `"use client"` banners.
