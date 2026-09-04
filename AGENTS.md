# AGENTS.md

Guidance for coding agents (and humans) working in this repository.

## Repo map

```
packages/next-webmcp/     the library. src/{index.ts,form.tsx,devtools.tsx,config.ts,internal.ts}, test/
apps/commerce/            demo storefront (vercel/commerce fork). app/, components/, lib/ (mock provider, tools)
examples/minimal/         two-tool example on a fresh App Router app
docs/API_CONTRACT.md      binding public API and verified Chrome spec facts — read before touching src/
docs/IMPLEMENTATION_PLAN.md  behaviors B1–B11, build order, risks
docs/SUBMISSION.md, docs/EVAL.md
skills/next-webmcp-adoption/  skill for adopting the library in another app
.github/workflows/ci.yml  prettier → build lib → typecheck → test → build commerce (Node 20/22)
.changeset/               changesets config; add one for every user-visible change
```

## Commands

```sh
pnpm install                     # once (uses the lockfile)
pnpm build                       # library (tsdown) → packages/next-webmcp/dist
pnpm dev                         # apps/commerce on http://localhost:3000 (mock mode, no env)
pnpm test                        # vitest for the library
pnpm typecheck                   # tsc in every workspace (build the library first)
pnpm format:check | pnpm format  # prettier
pnpm --filter next-webmcp test:watch
pnpm --filter example-minimal dev
```

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` in the public API.
- `"use client"` is the first line of every client module. Never read `document` or `window` at module scope;
  feature-detect inside effects or handlers.
- Public exports carry JSDoc with `@example` and `@see`.
- Small single-purpose modules. Naming and shape follow next-intl, nuqs, next-safe-action.
- Tool results are strings. Errors returned to agents are sentences, never stack traces.
- Tools that navigate return their result first and push in `setTimeout(…, 0)`.
- Prettier: double quotes, semicolons, trailing commas, `printWidth: 100`. Run `pnpm format` before finishing.
- Do not add dependencies to the library. Peers only: next, react, react-dom, zod.
- Do not invent exports beyond `docs/API_CONTRACT.md`; propose contract changes there first.

## Ownership boundaries

| Area                                     | Owner / rule                                                        |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `docs/API_CONTRACT.md`                   | Change only with agreement from library and app owners.             |
| `packages/next-webmcp/src`, `test`       | Library. Must satisfy the contract and B1–B11.                      |
| `apps/commerce/app`, `apps/commerce/lib` | Demo. Uses only the public API. Mock provider must run with no env. |
| `examples/minimal`                       | Must stay on the contract API; no library internals.                |
| Docs, CI, changesets, skill              | Keep in sync with the contract; never publish unverified numbers.   |

Never run `git commit` or `git push` on behalf of a user unless asked. Never delete files you do not own.

## How to add a tool

1. Pick the segment that owns it (`app/**/layout.tsx` or `page.tsx`). Tools should exist only where they make
   sense; `add_to_cart` belongs on the product page, not the root layout.
2. Write or reuse a server action in that segment's `actions.ts`. The action is the tool body.
3. Add the tool to that segment's `tools.ts` with `defineTools`/`tool`: Zod `input`, a description that says
   what it does and returns, `annotations.readOnlyHint` for reads, `confirm` for anything consequential.
4. Mount it: a `"use client"` wrapper renders `<ModelContext tools={...}>` around the segment's children.
5. Update the manifest entry in `next.config.ts` if the app writes one.
6. Verify in Chrome (`chrome://flags/#enable-webmcp-testing`) with the DevTools panel: the tool appears on the
   right route, disappears on navigation, and returns a useful string.
7. Add a test if it is library behavior; add a changeset if it is user-visible.
