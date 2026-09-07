# AGENTS.md

Guidance for coding agents (and humans) working in this repository.

## Repo map

The `nextjs-webmcp` package lives at the repository root. Examples are pnpm workspace members that depend on
`"nextjs-webmcp": "workspace:*"`.

```
src/                      the package. index.ts (plain barrel; client modules carry their own "use client"), form.tsx,
                          devtools.tsx, manifest.ts, server.ts (toolAction), navigation-tool.ts (navigationTool),
                          action-result.ts (unwrap, ToolActionResult), internal.ts + helpers
test/                     vitest + jsdom with a fake document.modelContext (fake-model-context.ts)
examples/commerce/        demo storefront (vercel/commerce fork): app/, components/, lib/ (mock provider, tools)
examples/minimal/         three-tool example on a fresh App Router app
docs/api.md               API reference (every export, signatures, examples) — read before touching src/
docs/EVAL.md              evaluation tasks
skills/nextjs-webmcp-adoption/  skill for adopting the library in another app
.github/workflows/ci.yml  prettier → build → typecheck (package + examples) → test → build commerce (Node 22/24)
CHANGELOG.md              add a line for every user-visible change
```

## Commands

```sh
pnpm install                     # once (uses the lockfile)
pnpm build                       # package (tsdown) → dist/
pnpm test | pnpm test:watch      # vitest
pnpm typecheck                   # package
pnpm typecheck:examples          # examples (build the package first; they resolve nextjs-webmcp from dist/)
pnpm build:examples              # next build for every example
pnpm example:commerce            # http://localhost:3000, mock mode, no env
pnpm example:minimal
pnpm lint | pnpm format          # prettier --check . | prettier --write .
```

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`. No `any` in the public API.
- `"use client"` is the first line of every client module. `src/manifest.ts` and `src/server.ts` are
  server-safe: no React, no directive. Never read `document` or `window` at module scope; feature-detect
  inside effects or handlers.
- Public exports carry JSDoc with `@example` and `@see`.
- Small single-purpose modules. Naming and shape follow next-intl, nuqs, next-safe-action.
- Tool results are strings. Errors returned to agents are sentences, never stack traces. Server actions
  behind tools go through `toolAction()` so they validate again on the server and return
  `{ ok, data | error }` instead of throwing; tools read that with `unwrap()`.
- Tools that navigate return their result first and push in `setTimeout(…, 0)`; `navigationTool()` does
  this for an allowlist of route patterns — do not hand-roll path parsing in an example.
- `<ModelContext>` registers by tool identity (name, title, description, input schema, annotations) with one
  `AbortController` per tool, and `execute` reads the latest definition and route context at call time. Do
  not add mount-scoped state channels to avoid re-registration; a factory inside `useMemo` is enough.
- Prettier: double quotes, semicolons, trailing commas, `printWidth: 100`. Run `pnpm format` before finishing.
- Do not add dependencies to the package. Peers only: next, react, react-dom, zod.
- Do not invent exports beyond `docs/api.md`; update it in the same PR as any public API change.

## Ownership boundaries

| Area                                             | Owner / rule                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `docs/api.md`                                    | The public API reference. Change only with agreement from library and app owners. |
| `src/`, `test/`                                  | Library. Must match `docs/api.md`.                                                |
| `examples/commerce/app`, `examples/commerce/lib` | Demo. Uses only the public API. Mock provider must run with no env.               |
| `examples/minimal`                               | Uses only the public API; no library internals.                                   |
| Docs, CI, CHANGELOG, skill                       | Keep in sync with `docs/api.md`; never publish unverified numbers.                |

Never run `git commit` or `git push` on behalf of a user unless asked. Never delete files you do not own.

## How to add a tool

1. Pick the segment that owns it (`app/**/layout.tsx` or `page.tsx`). Tools should exist only where they make
   sense; `add_to_cart` belongs on the product page, not the root layout.
2. Write or reuse a server action in that segment's `actions.ts`, wrapped in `toolAction(schema, handler)`
   from `nextjs-webmcp/server` so the server validates the arguments again and returns `{ ok, data | error }`.
   Keep the schema in a plain module both files import (a `"use server"` file exports only functions). The
   action is the tool body.
3. Add the tool to that segment's `tools.ts` with `defineTools`/`tool`: the shared Zod `input`, a description
   that says what it does and returns, `annotations.readOnlyHint` for reads, and
   `unwrap(await action(input))` in `execute`. For moving between pages add one
   `navigationTool({ routes })` at the root instead of a per-page navigation tool.
4. Mount it: a `"use client"` wrapper renders `<ModelContext tools={...}>` around the segment's children. Tools
   built from props (`createProductTools(product)`) go through `useMemo`; a new array or a new closure with
   the same identity is diffed, not re-registered.
5. Add the route's tools to the manifest handler in `app/.well-known/webmcp.json/route.ts`
   (`createManifestHandler({ "/": rootTools, "/product/[handle]": productTools, … })`).
6. Verify in Chrome (`chrome://flags/#enable-webmcp-testing`) with the DevTools panel: the tool appears on the
   right route, disappears on navigation, and returns a useful string. Check `/.well-known/webmcp.json`.
7. Add a test if it is library behavior; add a line to CHANGELOG.md if it is user-visible.
