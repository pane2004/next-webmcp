---
"next-webmcp": minor
---

Initial release.

- `tool` / `defineTools` with Zod input converted to JSON Schema via `z.toJSONSchema`.
- `<ModelContext>`: route-scoped registration with one `AbortController` per mount; re-registers on route
  change; no-op without `document.modelContext`. The outermost instance renders the approval card by default
  (`confirmations={false}` opts out); a confirm-gated tool with no card mounted fails at once with
  `CONFIRM_NO_RENDERER` instead of hanging.
- `<ToolConfirmations>` and the `confirm` option for human-in-the-loop approval.
- `useToolCalls()` and `useModelContextTools()`.
- `next-webmcp/form`: `next/form` wrapper answering agent submits with `respondWith`. `action` is typed by its
  return value (`ToolFormProps<R>`), and the JSX typings for `toolname`, `tooldescription`, `toolautosubmit`
  and `toolparamdescription` ship with the entry — no augmentation or cast in the app.
- `next-webmcp/manifest`: `buildManifest` and `createManifestHandler` serve `/.well-known/webmcp.json` from a
  route handler using the same `ToolDef[]` arrays as the page.
- `next-webmcp/devtools`: dev-only Tools / Run / Calls panel.
