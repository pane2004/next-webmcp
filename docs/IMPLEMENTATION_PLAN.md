# next-web-mcp — implementation plan

Status date: **2026-09-05**. Hackathon deadline: **2026-09-04 01:00 PDT**. Origin trial for
`https://next-webmcp-commerce.vercel.app` expires **2026-11-16**.

The binding API is [API_CONTRACT.md](./API_CONTRACT.md); the reader-facing reference is [api.md](./api.md).
This document explains how the pieces fit, what each behavior must do to be accepted, and the order of work.

## 1. Architecture

```
  app/.well-known/webmcp.json/route.ts ──createManifestHandler({ "/": tools, … })──▶ GET /.well-known/webmcp.json
                                            (next-web-mcp/manifest, server-safe, same ToolDef[] as below)

  Browser (client components)
  ┌────────────────────────────────────────────────────────────────────────┐
  │ <ModelContext tools>  ──registerTool(tool, {signal})──▶ document.modelContext
  │   • one AbortController per tool; diffed by identity key                │
  │     (name, title, description, inputSchema, annotations)                │
  │   • Zod → JSON Schema (z.toJSONSchema)                                  │
  │   • execute pipeline: parse → confirm → server action → stringify       │
  │   • ctx = { params, pathname, searchParams, router, confirm },          │
  │     read from a `latest` ref at call time (no re-register on navigation)│
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
               Next.js server: toolAction(schema, handler) ──▶ { ok, data } | { ok, error }
                               (next-web-mcp/server; the tool reads it with unwrap())
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
`"next-web-mcp": "workspace:*"`.

```
src/index.ts        "use client" — tool, defineTools, navigationTool, unwrap, ModelContext, ToolConfirmations, hooks, errors, types
src/index.server.ts react-server build of the main entry: tool, defineTools, navigationTool, unwrap, errors are real functions
src/navigation-tool.ts  navigationTool: navigate_to from an allowlist of route patterns (builds a ToolDef via tool())
src/action-result.ts    ToolActionResult + unwrap, shared by the main and server entries
src/server.ts       server-safe — toolAction (no React, no directive)
src/form.tsx        "use client" — Form (next/form wrapper) + global JSX augmentation for the WebMCP attributes
src/devtools.tsx    "use client" — WebMCPDevTools (returns null in production)
src/manifest.ts     server-safe — buildManifest, createManifestHandler (no React, not a client entry)
src/internal.ts     __resetForTests, registry
test/               vitest + jsdom with a fake document.modelContext
tsdown.config.ts    ESM, dts; client entries keep their "use client" directive, manifest and server do not get one
examples/commerce/  demo (vercel/commerce fork, mock provider, tools per route, /learn, manifest route)
examples/minimal/   three tools (get_time, add_todo via toolAction, navigate_to) + confirm + manifest route
docs/               contract, api reference, this plan, submission, eval
skills/             adoption skill for coding agents
```

## 3. Behaviors and acceptance criteria

| ID  | Behavior                    | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Feature detection           | `isModelContextAvailable()` is false in SSR and in browsers without WebMCP. `<ModelContext>` renders children, logs `[next-web-mcp] document.modelContext is unavailable…` once via `console.info`, and never throws. No module-scope `document`/`window`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B2  | Route-scoped registration   | On mount each tool is passed to `registerTool` with its own `AbortController.signal`; unmount aborts all. Registration is keyed by identity (`name`, `title`, `description`, `inputSchema`, `annotations`) and diffed by name on every `tools` change: new name → register; same identity → nothing; changed identity → abort + register that tool only; removed name → abort. `pathname`/`params` changes, new array identities and new factory results with the same identity never re-register; `execute` reads the latest definition and route context from a ref at call time; `registry.updateToolRoute` keeps the DevTools route current. Tests: mount → `getTools()` has N tools; unmount → 0; navigation → `registerCalls` unchanged and `ctx` fresh; one changed description → one abort + one register; StrictMode → one registration per tool. |
| B3  | Zod → JSON Schema           | `inputSchema = z.toJSONSchema(def.input)`, converted eagerly in `tool()`/`defineTools()` and cached per schema. Missing `z.toJSONSchema` throws `NextWebMCPError("ZOD_TO_JSON_SCHEMA_UNSUPPORTED")` at definition time, not in render. Test stubs `zod.toJSONSchema` to `undefined`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B4  | Validation + agent errors   | Invalid input returns `Invalid input for <name>: <path>: <message>; … Fix the arguments and call again.` Thrown errors return `<name> failed: <message>. Check the page state and try again.` No stack traces in results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B5  | Server actions as `execute` | `execute(ctx)(input, { signal })` runs with `ctx = { params, pathname, searchParams, router, confirm }`. String results pass through; objects are `JSON.stringify`ed. Test: a fake action receives parsed input; the result is a string.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B6  | Confirm gate                | `confirm: true` → card with `title ?? name` and args as label/value rows; function form → custom `ConfirmRequest`. Deny, 60 s timeout, or aborted signal → `User declined <name>.` and the action is not called. If no confirmations renderer is subscribed, reject at once with `CONFIRM_NO_RENDERER` (agent gets `<name> failed: …`; `warnOnce` in dev). Card has `role="dialog"`, `aria-live="polite"`, Enter/Escape.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B7  | Call log                    | Every execution appends `{ id, name, route, args, startedAt, durationMs, result, ok }` to a 200-entry ring buffer. `useToolCalls()` returns newest first and re-renders subscribers. Works in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B8  | Live tool list              | `useModelContextTools()` reads `getTools()` on mount and on every `toolchange`. Entries registered by us carry `route`; others have `route: undefined`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B9  | DevTools panel              | `WebMCPDevTools` returns `null` when `NODE_ENV === "production"` unless `force`. Tabs: Tools (grouped by route, schema toggle, Copy prompt), Run (`executeTool`, shows "navigated (null)"), Calls. Inline styles; no dependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B10 | Declarative `Form`          | Renders `next/form` with `toolname`, `tooldescription`, `toolautosubmit`. When `nativeEvent.agentInvoked` is true: `preventDefault()`, run the function `action` with `new FormData(form)`, pass `respond(result)` to `respondWith`. String `action` → native submit. `data-tool-active` between `toolactivated` and `toolcancel`/submit. `ToolFormProps<R>` types `action` by its return value; the global JSX augmentation ships in `dist/form.d.ts` (verified by grep and by typechecking `examples/commerce` without its own augmentation).                                                                                                                                                                                                                                                                                                            |
| B11 | Manifest route handler      | `buildManifest(routes)` returns `{ version: 1, routes: [{ route, tools: [{ name, title?, description, inputSchema, annotations? }] }] }` using `toolInputToJsonSchema`; a nameless `ToolDef` throws `TOOL_NAME_INVALID`. `createManifestHandler(routes \| () => routes \| Promise)` returns a GET handler responding `application/json` with `Cache-Control: public, max-age=300`. No React import, no `"use client"`, nothing written to `public/`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| B12 | Default confirm UI          | `<ModelContext>` provides its own React context. The outermost instance renders `<ToolConfirmations/>` as a sibling of `children` unless `confirmations={false}`; nested instances render nothing extra. Test: one card in the DOM with two nested contexts; zero with `confirmations={false}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Cross-cutting: dev `console.warn` once for `TOOL_NAME_DUPLICATE`; `TOOL_NAME_INVALID` for names outside
`[A-Za-z0-9_.-]{1,128}`; tools that navigate return first and push in a later task (documented, app-owned).

## 4. Demo tools (examples/commerce)

| Route                             | Tool                   | Kind                          | Server action / behavior                                                                                                                     |
| --------------------------------- | ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (root layout)                 | `search_products`      | readOnly                      | `searchProducts = toolAction(searchProductsInput, …)`; read with `unwrap()`; returns handle/title/price/options                              |
| `/`                               | `get_cart`             | readOnly                      | current cart lines and totals                                                                                                                |
| `/`                               | `navigate_to`          | navigation (`navigationTool`) | allowlist `/`, `/search` (+`q`), `/search/[collection]`, `/product/[handle]`, `/checkout`, `/learn`; returns first, then `router.push(href)` |
| `/`                               | `update_quantity`      | mutation                      | `updateItemQuantity`                                                                                                                         |
| `/`                               | `remove_item`          | mutation                      | `removeItem`                                                                                                                                 |
| `/`                               | `start_checkout`       | **confirm**                   | checkout URL, then push after returning                                                                                                      |
| `/product/[handle]`               | `get_product`          | readOnly, uses `ctx.params`   | product by handle                                                                                                                            |
| `/product/[handle]`               | `add_to_cart`          | mutation, uses `ctx.params`   | `addItem(variantId, quantity)`                                                                                                               |
| `/search`, `/search/[collection]` | `refine_results`       | navigation (search params)    | pushes `?q=&sort=` and returns the new result count                                                                                          |
| footer (all routes)               | `subscribe_newsletter` | declarative `<Form>`          | `toolAction(newsletterInput, …)` behind a `FormData` action returning a message; `respondWith`                                               |
| `/learn`                          | —                      | page                          | shows `useModelContextTools()` live with route labels                                                                                        |
| `/.well-known/webmcp.json`        | —                      | route handler                 | `createManifestHandler` over the same tool arrays                                                                                            |

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
- [x] 0.2 API cleanup item 1, register by stable key (below) — 2026-09-05
- [x] Delete the commerce cart bridge (follow-up of item 1): `createRootTools(cartApi)` /
      `createProductTools(product, cartApi)` inside `useMemo`, `cartApiStub` for the manifest route — 2026-09-05
- [x] `next-web-mcp/server` (`toolAction`) + `unwrap`, and `navigationTool` (items 7–8 below) — 2026-09-05
- [x] Adopt them in both examples: commerce `searchProducts` / `subscribeToNewsletter` via `toolAction`,
      `navigate_to` via `navigationTool` (hand-rolled `resolveDestination` removed); minimal `addTodo` via
      `toolAction`, `navigate_to` over `/` and `/todos/[id]` — 2026-09-05
- [ ] `pnpm build && pnpm typecheck && pnpm typecheck:examples && pnpm test` green on CI (Node 22 and 24)
- [ ] Run the eval protocol and fill `docs/EVAL.md` from real logs
- [ ] Record the < 3 min video (`docs/SUBMISSION.md` script)
- [ ] Publish `next-web-mcp@0.1.0` to npm (changeset present)

## 6. 0.2 — API cleanup

Six changes identified after the first Chrome 150 run, plus two helpers (7–8) added on 2026-09-05. Items 4–6
shipped on 2026-09-04 and items 1, 7 and 8 on 2026-09-05; all six are part of the contract. Items 2–3 are
next.

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 1   | **Register by stable key.** Each tool is registered under an identity key (`name`, `title`, `description`, `inputSchema`, `annotations`) with its own `AbortController`; the `tools` array is diffed by name, so only a tool that appears, disappears or changes shape touches `document.modelContext`. `pathname`, `params`, `router` and the current `ToolDef` live in a ref the executor reads at call time, so navigation and new factory results never re-register. `registry.updateToolRoute` keeps the DevTools grouping current. Fewer `toolchange` events, no window where a tool is missing. | done 2026-09-05 |
| 2   | **Flat `execute(input, ctx)`.** Replace the curried `execute: (ctx) => (input, opts) => …` with `execute(input, ctx)` where `ctx` carries `signal`. Simpler to write and to type; `tool()` keeps inference.                                                                                                                                                                                                                                                                                                                                                                                            | next            |
| 3   | **`ctx.navigate(url)`.** A helper that records the tool's result, returns it, and pushes after the promise resolves — replacing the `setTimeout(() => ctx.router.push(url), 0)` idiom in every navigating tool.                                                                                                                                                                                                                                                                                                                                                                                        | next            |
| 4   | **`next-web-mcp/form` ships its JSX typings.** Global augmentation of `FormHTMLAttributes` / `InputHTMLAttributes` / `SelectHTMLAttributes` / `TextareaHTMLAttributes`; `ToolFormProps<R>` types `action` by its return value so `action={subscribe}` needs no cast; `respond` receives `R`.                                                                                                                                                                                                                                                                                                           | done 2026-09-04 |
| 5   | **`<ModelContext>` renders the approval UI.** New `confirmations?: boolean` (default `true`); the outermost instance renders `<ToolConfirmations/>`, nested ones do not. A confirm with no renderer subscribed rejects at once with `CONFIRM_NO_RENDERER` instead of hanging 60 s.                                                                                                                                                                                                                                                                                                                     | done 2026-09-04 |
| 6   | **Manifest as a route handler.** The config entry (the `next.config` wrapper that synchronously wrote to `public/`) is removed; `next-web-mcp/manifest` adds `buildManifest` and `createManifestHandler`, built from the same `ToolDef[]` arrays, served at `/.well-known/webmcp.json`.                                                                                                                                                                                                                                                                                                                | done 2026-09-04 |
| 7   | **`next-web-mcp/server`: `toolAction(input, handler, { output?, onError? })`.** Wraps a server action so the server re-validates with the same Zod schema, never throws, and resolves to `ToolActionResult` (`{ ok: true, data }` / `{ ok: false, error }`) with the same `Invalid input: …` wording as `<ModelContext>`; thrown errors are logged and reported as a generic sentence unless `onError` maps them. `unwrap()` on the main entry rethrows the error inside `execute` so the agent reads it. Server-safe entry, no React.                                                                 | done 2026-09-05 |
| 8   | **`navigationTool({ routes })`.** A `navigate_to` tool built from an allowlist of App Router patterns: `route` is an enum, `params` fill the `[segment]`s (presence checked, optional Zod `params`/`query` schemas listed in the description), every value `encodeURIComponent`-encoded, `Navigating to <href>.` returned first and `router.push` in `setTimeout(…, 0)`. Replaces the hand-rolled `resolveDestination` in the commerce demo. Real function under `react-server`.                                                                                                                       | done 2026-09-05 |

Follow-up from item 1 (done 2026-09-05): the cart bridge in `examples/commerce` (`publishCartBridge` /
`readCartBridge` in `app/tools.ts`, fed from `<CartTools>` in a layout effect) existed only because rebuilding
the root tools per render used to re-register them. With identity-keyed registration `createRootTools(cartApi)`
inside `useMemo` is safe — the new closure is picked up on the next call without a re-registration — so the
bridge and its layout effect were deleted; the root and product tools read `cartApi` directly, and the manifest
route passes `cartApiStub` (`lib/mock/cart-api-stub.ts`) because it only needs names, descriptions and schemas.

## 7. Risks and open questions

| Risk                                       | Detail                                                                                                                                                   | Mitigation                                                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `respondWith` + React forms                | React 19 owns form submission; `next/form` may intercept before our `onSubmit`. `e.nativeEvent.respondWith` must be called synchronously in the handler. | Call `preventDefault()` and `respondWith()` inside `onSubmit` before any async work; verified in Chrome 150.                                                                                             |
| `executeTool` returns `null` on navigation | Tools that `router.push` before returning lose their result.                                                                                             | Documented rule: return the string, then push in `setTimeout(…, 0)`; `navigationTool` (item 8) does it for page navigation. DevTools shows "navigated (null)". Item 3 above removes the idiom elsewhere. |
| Zod 3 fallback                             | Zod 3.x has no `z.toJSONSchema` on its root export.                                                                                                      | Peer range is `zod@^4`; `tool()`/`defineTools()` throw `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` at definition time with an upgrade hint.                                                                         |
| ChatGPT browser availability               | Native WebMCP support in the ChatGPT desktop browser cannot be verified on every judge's machine.                                                        | Origin trial covers Chrome without a flag; DevTools Run tab works with no external agent at all.                                                                                                         |
| `useSearchParams` in `<ModelContext>`      | Reading search params in a client component can bail a static page out to CSR unless isolated in a Suspense boundary.                                    | `ctx.searchParams` is read from `window.location.search` when the tool runs; no hook, no bailout.                                                                                                        |
| In-flight executions after abort           | Chrome 153+ does not cancel running `execute` calls when the signal aborts.                                                                              | Forward the tool's signal; long actions check `signal.aborted` before side effects.                                                                                                                      |
| Identity key cost                          | A factory that builds new Zod schemas on every render misses the per-schema WeakMap cache, so `z.toJSONSchema` runs each time the `tools` array changes. | Wrap factories in `useMemo` keyed on their inputs (as the examples do); correctness does not depend on it.                                                                                               |
| Manifest drift                             | A hand-written manifest goes stale as tools change.                                                                                                      | Built from the same `ToolDef[]` at request time; tools with data-dependent factories use the async form of the handler.                                                                                  |
| Ambient augmentation in `dist/form.d.ts`   | A dts bundler can drop `declare module "react"` blocks.                                                                                                  | Post-build grep; fall back to `dist/form-jsx.d.ts` referenced from `dist/form.d.ts`. Verified by typechecking the commerce example without its own augmentation.                                         |
| Origin trial expiry                        | Token stops working 2026-11-16 (Chrome 149–156).                                                                                                         | Documented; re-register or rely on the flag after that date.                                                                                                                                             |

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

- CI green on Node 22 and 24: prettier, typecheck (package and examples), tests, package build, commerce build
  (mock, no env).
- Demo deployed; opening `https://next-webmcp-commerce.vercel.app` in Chrome 149+ lists the root tools in the
  Model Context Tool Inspector without any flag; `/.well-known/webmcp.json` returns the manifest.
- The sample prompt (search → open product → add to cart → checkout with approval) succeeds end-to-end in
  Chrome with the DevTools panel showing the tool swap on navigation.
- `docs/EVAL.md` results section filled from real runs, or explicitly left at "0 runs".
- `next-web-mcp@0.1.0` publishable: `pnpm build` produces `dist/` with types, the `"use client"` directives
  on client entries, and the JSX augmentation in `dist/form.d.ts`.
