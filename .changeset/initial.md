---
"next-webmcp": minor
---

Initial release.

- `tool` / `defineTools` with Zod input converted to JSON Schema via `z.toJSONSchema`.
- `<ModelContext>`: route-scoped registration with one `AbortController` per mount; re-registers on route
  change; no-op without `document.modelContext`.
- `<ToolConfirmations>` and the `confirm` option for human-in-the-loop approval.
- `useToolCalls()` and `useModelContextTools()`.
- `next-webmcp/form`: `next/form` wrapper answering agent submits with `respondWith`.
- `next-webmcp/devtools`: dev-only Tools / Run / Calls panel.
- `next-webmcp/config`: `withWebMCP` with an optional `public/.well-known/webmcp.json` writer.
