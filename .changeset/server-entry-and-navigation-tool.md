---
"next-web-mcp": minor
---

New `next-web-mcp/server` entry, `navigationTool()`, and the package name `next-web-mcp`.

- **`next-web-mcp/server`** — `toolAction(input, handler, { output?, onError? })` wraps a server action:
  it validates the arguments with the Zod `input` schema on the server (defaults applied), runs the
  handler, optionally checks the result against `output`, and always resolves to a plain
  `ToolActionResult` (`{ ok: true, data }` or `{ ok: false, error }`). Invalid input reads
  `Invalid input: <path>: <message>; … Fix the arguments and call again.`, the same wording
  `<ModelContext>` uses. A thrown error is logged with `console.error` and reported as
  `The action failed on the server. Try again.` unless `onError` maps it; thrown messages never leak
  into the result by default. A result that fails `output` becomes
  `The server returned an unexpected result.` The entry has no React and no `"use client"`.
- **`unwrap(result)`** on the main entry returns `data` or throws `Error(error)`, so inside `execute`
  the agent reads `<name> failed: <error>. Check the page state and try again.` `ToolActionResult<T>`
  is exported from both entries.
- **`navigationTool({ routes, name?, description?, replace?, scroll? })`** on the main entry builds a
  `navigate_to` tool from an allowlist of App Router route patterns (`"/"`, `"/product/[handle]"`,
  `"/docs/[...slug]"`, `"/docs/[[...slug]]"`). The input is `{ route: enum of the patterns, params?,
query? }`; every value is `encodeURIComponent`-encoded into its segment, so no input can leave the
  site. Optional `params` / `query` Zod objects add validation and are listed in the generated
  description. The tool returns `Navigating to <href>.` and pushes in `setTimeout(…, 0)`. Under the
  `react-server` condition `navigationTool` and `unwrap` are real functions, like `tool` and
  `defineTools`, so a shared `tools.ts` still loads in the manifest route handler.
- **Name** — the package is published as `next-web-mcp`. The repository previously spelled the name without
  the hyphen between `web` and `mcp` in its docs and console messages (it was never published under that spelling): the `[next-web-mcp]`
  console prefix, the `--next-web-mcp-*` CSS variables and the `data-next-web-mcp` attributes follow
  the new name; `NextWebMCPError` and its `code` values are unchanged.
