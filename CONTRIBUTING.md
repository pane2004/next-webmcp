# Contributing

Thanks for helping. The `next-web-mcp` package lives at the repository root (`src/`, `test/`); the pnpm
workspace also holds `examples/commerce` (the demo storefront) and `examples/minimal`.

## Setup

```sh
pnpm install
pnpm build              # package first; the examples typecheck against dist/
pnpm test
pnpm example:commerce   # demo on http://localhost:3000
```

Node 22 or 24. No environment variables are needed; the demo runs against a mock provider.

## Before opening a PR

1. `pnpm format` (prettier).
2. `pnpm build && pnpm typecheck && pnpm typecheck:examples && pnpm test`.
3. `pnpm --filter example-commerce build` if you touched the demo.
4. Add a line to `CHANGELOG.md` for user-visible changes to the package.
5. Public API changes: update `docs/api.md` in the same PR.

CI runs the same steps on Node 22 and 24.

## Guidelines

- Keep the package dependency-free beyond its peers.
- Every public export gets JSDoc with `@example` and `@see`.
- Tests use a fake `document.modelContext` in jsdom (see `test/fake-model-context.ts`). Do not add tests
  that require a real browser.
- Match the tone of the docs: reader-first, no marketing. Do not add numbers that are not backed by
  `docs/EVAL.md` run logs.

## Reporting issues

Use the issue templates. For security problems see [SECURITY.md](./SECURITY.md).

By contributing you agree that your contributions are licensed under the MIT license.
