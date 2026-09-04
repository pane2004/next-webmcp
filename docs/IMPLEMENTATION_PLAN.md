# next-webmcp — implementation plan

Status date: **2026-09-04**. Hackathon deadline: **2026-09-04 01:00 PDT**. Origin trial for
`https://next-webmcp-commerce.vercel.app` expires **2026-11-16**.

The binding API is [API_CONTRACT.md](./API_CONTRACT.md); the reader-facing reference is [api.md](./api.md).
This document explains how the pieces fit, what each behavior must do to be accepted, and the order of work.

## 1. Architecture

```
  app/.well-known/webmcp.json/route.ts ──createManifestHandler({ "/": tools, … })──▶ GET /.well-known/webmcp.json
                                            (next-webmcp/manifest, server-safe, same ToolDef[] as below)

  Browser (client components)
  ┌────────────────────────────────────────────────────────────────────────┐
  │ <ModelContext tools>  ──registerTool(tool, {signal})──▶ document.modelContext
  │   • one AbortController per mount                                       │
  │   • Zod → JSON Schema (z.toJSONSchema)                                  │
  │   • execute pipeline: parse → confirm → server action → stringify       │
  │   • ctx = { params, pathname, searchParams, router, confirm }           │
  │   • outermost instance renders <ToolConfirmations/> (confirmations≠false)│
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
- One source of truth for tool metadata: the manifest is built from the same `ToolDef[]` the page registers.

## 2. Repository layout

The package lives at the repository root; the examples are pnpm workspace members that depend on
`"next-webmcp": "workspace:*"`.

```
src/index.ts        "use client" — tool, defineTools, ModelContext, ToolConfirmations, hooks, errors, types
src/form.tsx        "use client" — Form (next/form wrapper) + global JSX augmentation for the WebMCP attributes
src/devtools.tsx    "use client" — WebMCPDevTools (returns null in production)
src/manifest.ts     server-safe — buildManifest, createManifestHandler (no React, not a client entry)
src/internal.ts     __resetForTests, registry
test/               vitest + jsdom with a fake document.modelContext
tsdown.config.ts    ESM, dts; client entries keep their "use client" directive, manifest does not get one
examples/commerce/  demo (vercel/commerce fork, mock provider, tools per route, /learn, manifest route)
examples/minimal/   two tools + confirm + manifest route on a fresh App Router app
docs/               contract, api reference, this plan, submission, eval
skills/             adoption skill for coding agents
```

## 3. Behaviors and acceptance criteria

| ID  | Behavior                    | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Feature detection           | `isModelContextAvailable()` is false in SSR and in browsers without WebMCP. `<ModelContext>` renders children, logs `[next-webmcp] document.modelContext is unavailable…` once via `console.info`, and never throws. No module-scope `document`/`window`.                                                                                                                                                                                                                                                                                       |
| B2  | Route-scoped registration   | On mount each tool is passed to `registerTool` with the mount's `AbortController.signal`. Unmount aborts. Changing `pathname` or serialized `params` aborts and re-registers so `ctx` is fresh. Test: mount → `getTools()` has N tools; unmount → 0.                                                                                                                                                                                                                                                                                            |
| B3  | Zod → JSON Schema           | `inputSchema = z.toJSONSchema(def.input)`, converted eagerly in `tool()`/`defineTools()` and cached per schema. Missing `z.toJSONSchema` throws `NextWebMCPError("ZOD_TO_JSON_SCHEMA_UNSUPPORTED")` at definition time, not in render. Test stubs `zod.toJSONSchema` to `undefined`.                                                                                                                                                                                                                                                            |
| B4  | Validation + agent errors   | Invalid input returns `Invalid input for <name>: <path>: <message>; … Fix the arguments and call again.` Thrown errors return `<name> failed: <message>. Check the page state and try again.` No stack traces in results.                                                                                                                                                                                                                                                                                                                       |
| B5  | Server actions as `execute` | `execute(ctx)(input, { signal })` runs with `ctx = { params, pathname, searchParams, router, confirm }`. String results pass through; objects are `JSON.stringify`ed. Test: a fake action receives parsed input; the result is a string.                                                                                                                                                                                                                                                                                                        |
| B6  | Confirm gate                | `confirm: true` → card with `title ?? name` and args as label/value rows; function form → custom `ConfirmRequest`. Deny, 60 s timeout, or aborted signal → `User declined <name>.` and the action is not called. If no confirmations renderer is subscribed, reject at once with `CONFIRM_NO_RENDERER` (agent gets `<name> failed: …`; `warnOnce` in dev). Card has `role="dialog"`, `aria-live="polite"`, Enter/Escape.                                                                                                                        |
| B7  | Call log                    | Every execution appends `{ id, name, route, args, startedAt, durationMs, result, ok }` to a 200-entry ring buffer. `useToolCalls()` returns newest first and re-renders subscribers. Works in production.                                                                                                                                                                                                                                                                                                                                       |
| B8  | Live tool list              | `useModelContextTools()` reads `getTools()` on mount and on every `toolchange`. Entries registered by us carry `route`; others have `route: undefined`.                                                                                                                                                                                                                                                                                                                                                                                         |
| B9  | DevTools panel              | `WebMCPDevTools` returns `null` when `NODE_ENV === "production"` unless `force`. Tabs: Tools (grouped by route, schema toggle, Copy prompt), Run (`executeTool`, shows "navigated (null)"), Calls. Inline styles; no dependencies.                                                                                                                                                                                                                                                                                                              |
| B10 | Declarative `Form`          | Renders `next/form` with `toolname`, `tooldescription`, `toolautosubmit`. When `nativeEvent.agentInvoked` is true: `preventDefault()`, run the function `action` with `new FormData(form)`, pass `respond(result)` to `respondWith`. String `action` → native submit. `data-tool-active` between `toolactivated` and `toolcancel`/submit. `ToolFormProps<R>` types `action` by its return value; the global JSX augmentation ships in `dist/form.d.ts` (verified by grep and by typechecking `examples/commerce` without its own augmentation). |
| B11 | Manifest route handler      | `buildManifest(routes)` returns `{ version: 1, routes: [{ route, tools: [{ name, title?, description, inputSchema, annotations? }] }] }` using `toolInputToJsonSchema`; a nameless `ToolDef` throws `TOOL_NAME_INVALID`. `createManifestHandler(routes \| () => routes \| Promise)` returns a GET handler responding `application/json` with `Cache-Control: public, max-age=300`. No React import, no `"use client"`, nothing written to `public/`.                                                                                            |
| B12 | Default confirm UI          | `<ModelContext>` provides its own React context. The outermost instance renders `<ToolConfirmations/>` as a sibling of `children` unless `confirmations={false}`; nested instances render nothing extra. Test: one card in the DOM with two nested contexts; zero with `confirmations={false}`.                                                                                                                                                                                                                                                 |

Cross-cutting: dev `console.warn` once for `TOOL_NAME_DUPLICATE`; `TOOL_NAME_INVALID` for names outside
`[A-Za-z0-9_.-]{1,128}`; tools that navigate return first and push in a later task (documented, app-owned).

## 4. Demo tools (examples/commerce)

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
| footer (all routes)               | `subscribe_newsletter` | declarative `<Form>`        | server action returning a message; `respondWith`      |
| `/learn`                          | —                      | page                        | shows `useModelContextTools()` live with route labels |
| `/.well-known/webmcp.json`        | —                      | route handler               | `createManifestHandler` over the same tool arrays     |

The root layout also emits `<meta http-equiv="origin-trial" content={WEBMCP_ORIGIN_TRIAL_TOKEN}>` from
`examples/commerce/lib/webmcp-origin-trial.ts`.

## 5. Build order

- [x] Scaffold pnpm monorepo, vendor vercel/commerce, MIT license — commit `ad54f38`
- [x] Public API contract (`docs/API_CONTRACT.md`) with verified Chrome spec facts
- [x] Library `src/` (B1–B9), `form.tsx` (B10), Vitest suite with fake `document.modelContext`
- [x] Commerce mock provider seeded from the Acme demo store; tools per route; `/learn`; origin-trial meta
- [x] Docs and repo infrastructure (READMEs, plan, submission, eval, CI, changesets, example, skill)
- [x] Deploy the commerce demo to https://next-webmcp-commerce.vercel.app and verify tools without a flag
      (2026-09-04: `search_products`, `add_to_cart`, `get_cart`, `start_checkout` approval and checkout
      navigation verified in Chrome 150 via `executeTool`)
- [x] Flatten the repo: package at the root, `examples/commerce` + `examples/minimal` as workspace members
- [x] 0.2 API cleanup items 4–6 (below) — 2026-09-04
- [ ] `pnpm build && pnpm typecheck && pnpm typecheck:examples && pnpm test` green on CI (Node 20 and 22)
- [ ] Run the eval protocol and fill `docs/EVAL.md` from real logs
- [ ] Record the < 3 min video (`docs/SUBMISSION.md` script)
- [ ] Publish `next-webmcp@0.1.0` to npm (changeset present)

## 6. 0.2 — API cleanup

Six changes identified after the first Chrome 150 run. Items 4–6 shipped on 2026-09-04 and are part of the
contract; items 1–3 are next.

| #   | Change                                                                                                                                                                                                                                                                                                                                            | Status          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | **State channel / register by stable key.** Register each tool once per mount under its name and push `pathname`, `params` and other route state through a small store the executor reads at call time, instead of aborting and re-registering on every `pathname`/`params` change. Fewer `toolchange` events, no window where a tool is missing. | next            |
| 2   | **Flat `execute(input, ctx)`.** Replace the curried `execute: (ctx) => (input, opts) => …` with `execute(input, ctx)` where `ctx` carries `signal`. Simpler to write and to type; `tool()` keeps inference.                                                                                                                                       | next            |
| 3   | **`ctx.navigate(url)`.** A helper that records the tool's result, returns it, and pushes after the promise resolves — replacing the `setTimeout(() => ctx.router.push(url), 0)` idiom in every navigating tool.                                                                                                                                   | next            |
| 4   | **`next-webmcp/form` ships its JSX typings.** Global augmentation of `FormHTMLAttributes` / `InputHTMLAttributes` / `SelectHTMLAttributes` / `TextareaHTMLAttributes`; `ToolFormProps<R>` types `action` by its return value so `action={subscribe}` needs no cast; `respond` receives `R`.                                                       | done 2026-09-04 |
| 5   | **`<ModelContext>` renders the approval UI.** New `confirmations?: boolean` (default `true`); the outermost instance renders `<ToolConfirmations/>`, nested ones do not. A confirm with no renderer subscribed rejects at once with `CONFIRM_NO_RENDERER` instead of hanging 60 s.                                                                | done 2026-09-04 |
| 6   | **Manifest as a route handler.** The config entry (the `next.config` wrapper that synchronously wrote to `public/`) is removed; `next-webmcp/manifest` adds `buildManifest` and `createManifestHandler`, built from the same `ToolDef[]` arrays, served at `/.well-known/webmcp.json`.                                                            | done 2026-09-04 |

## 7. Risks and open questions

| Risk                                       | Detail                                                                                                                                                   | Mitigation                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `respondWith` + React forms                | React 19 owns form submission; `next/form` may intercept before our `onSubmit`. `e.nativeEvent.respondWith` must be called synchronously in the handler. | Call `preventDefault()` and `respondWith()` inside `onSubmit` before any async work; verified in Chrome 150.                                                     |
| `executeTool` returns `null` on navigation | Tools that `router.push` before returning lose their result.                                                                                             | Documented rule: return the string, then push in `setTimeout(…, 0)`. DevTools shows "navigated (null)". Item 3 above removes the idiom.                          |
| Zod 3 fallback                             | Zod 3.x has no `z.toJSONSchema` on its root export.                                                                                                      | Peer range is `zod@^4`; `tool()`/`defineTools()` throw `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` at definition time with an upgrade hint.                                 |
| ChatGPT browser availability               | Native WebMCP support in the ChatGPT desktop browser cannot be verified on every judge's machine.                                                        | Origin trial covers Chrome without a flag; DevTools Run tab works with no external agent at all.                                                                 |
| `useSearchParams` in `<ModelContext>`      | Reading search params in a client component can bail a static page out to CSR unless isolated in a Suspense boundary.                                    | `ctx.searchParams` is read from `window.location.search` when the tool runs; no hook, no bailout.                                                                |
| In-flight executions after abort           | Chrome 153+ does not cancel running `execute` calls when the signal aborts.                                                                              | Forward the mount signal; long actions check `signal.aborted` before side effects.                                                                               |
| Manifest drift                             | A hand-written manifest goes stale as tools change.                                                                                                      | Built from the same `ToolDef[]` at request time; tools with data-dependent factories use the async form of the handler.                                          |
| Ambient augmentation in `dist/form.d.ts`   | A dts bundler can drop `declare module "react"` blocks.                                                                                                  | Post-build grep; fall back to `dist/form-jsx.d.ts` referenced from `dist/form.d.ts`. Verified by typechecking the commerce example without its own augmentation. |
| Origin trial expiry                        | Token stops working 2026-11-16 (Chrome 149–156).                                                                                                         | Documented; re-register or rely on the flag after that date.                                                                                                     |

## 8. Engineering standards

- [x] TypeScript strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; no `any` in the public API
- [x] `"use client"` as the first line of every client entry (preserved by tsdown on `dist`); `manifest` has none
- [x] No `document`/`window` access at module scope
- [x] JSDoc with `@example` and `@see` on every public export
- [x] Small single-purpose modules; conventions modeled on next-intl, nuqs, next-safe-action
- [x] Prettier (`printWidth: 100`, double quotes, trailing commas) — `pnpm lint`
- [x] Vitest with jsdom; tests never depend on a real browser
- [x] Changeset for every user-visible change

## 9. Definition of done

- CI green on Node 20 and 22: prettier, typecheck (package and examples), tests, package build, commerce build
  (mock, no env).
- Demo deployed; opening `https://next-webmcp-commerce.vercel.app` in Chrome 149+ lists the root tools in the
  Model Context Tool Inspector without any flag; `/.well-known/webmcp.json` returns the manifest.
- The sample prompt (search → open product → add to cart → checkout with approval) succeeds end-to-end in
  Chrome with the DevTools panel showing the tool swap on navigation.
- `docs/EVAL.md` results section filled from real runs, or explicitly left at "0 runs".
- `next-webmcp@0.1.0` publishable: `pnpm build` produces `dist/` with types, the `"use client"` directives
  on client entries, and the JSX augmentation in `dist/form.d.ts`.
