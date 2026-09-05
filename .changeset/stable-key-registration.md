---
"next-web-mcp": minor
---

`<ModelContext>` registers tools by identity instead of once per mount.

- A tool's identity is `name` + `title` + `description` + the JSON Schema of `input` + `annotations`. The
  `tools` array is diffed by name on every change: a new name registers, a removed name aborts, a changed
  identity aborts and re-registers that one tool. Each tool has its own `AbortController`; siblings are
  untouched.
- Re-renders, new array identities, `pathname`/`params` changes and factory results with the same identity
  never re-register: no `toolchange`, no window where a still-mounted tool is missing.
- `execute` and `confirm` always run the latest definition with the route context (`pathname`, `params`,
  `searchParams`, `router`) read when the call arrives, so a factory can close over new props without
  re-registering.
- `RegisteredToolInfo.route` (and the DevTools route grouping) follows navigation without touching
  `document.modelContext`.

Confirmations, input validation, error strings and the Chrome 150 guards are unchanged.
