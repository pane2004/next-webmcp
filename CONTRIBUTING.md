# Contributing

Thanks for helping. This repo is a pnpm monorepo: the library in `packages/next-webmcp`, a demo in
`apps/commerce`, and an example in `examples/minimal`.

## Setup

```sh
pnpm install
pnpm build          # library first; the apps typecheck against dist/
pnpm test
pnpm dev            # demo on http://localhost:3000
```

Node 20 or 22. No environment variables are needed; the demo runs against a mock provider.

## Before opening a PR

1. `pnpm format` (prettier).
2. `pnpm build && pnpm typecheck && pnpm test`.
3. `pnpm --filter commerce build` if you touched the demo.
4. Add a changeset for user-visible changes to the library:
   `pnpm dlx @changesets/cli add` (or write `.changeset/<name>.md` by hand: frontmatter with
   `"next-webmcp": patch | minor | major`, then a one-paragraph summary).
5. Public API changes go through `docs/API_CONTRACT.md` first.

CI runs the same steps on Node 20 and 22.

## Guidelines

- Keep the library dependency-free beyond its peers.
- Every public export gets JSDoc with `@example` and `@see`.
- Tests use a fake `document.modelContext` in jsdom (see `packages/next-webmcp/test`). Do not add tests that
  require a real browser.
- Match the tone of the docs: reader-first, no marketing. Do not add numbers that are not backed by
  `docs/EVAL.md` run logs.

## Reporting issues

Use the issue templates. For security problems see [SECURITY.md](./SECURITY.md).

By contributing you agree that your contributions are licensed under the MIT license and that you follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).
