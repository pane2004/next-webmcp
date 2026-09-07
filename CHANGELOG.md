# Changelog

## 0.1.0 (2026-09-07)

Initial release.

- Remove the human-approval gate (`confirm`, `<ToolConfirmations />`, `confirmations` prop, `CONFIRM_*` error codes). Authorize in the server action instead.
- Avoid a client-side crash when a browser's WebMCP bridge lacks EventTarget methods.
- Never throw out of `useModelContextTools()` when a browser bridge has no `getTools`, throws from it, or returns an array synchronously; ignore a non-`AbortSignal` `options.signal` passed to `execute`.
