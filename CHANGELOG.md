# Changelog

## 0.2.0 (unreleased)

- **Breaking:** `execute` is `(input, ctx)` instead of `(ctx) => (input, { signal })`. `ctx.signal`
  replaces the options object. `ToolExecuteOptions` is gone.
- `execute` may return a `toolAction()` result as is: `data` becomes the tool result and `error` becomes
  the failure sentence. `execute: myAction` is a complete tool body. `unwrap()` stays for formatting.

## 0.1.0 (2026-09-07)

Initial release.

- Remove the human-approval gate (`confirm`, `<ToolConfirmations />`, `confirmations` prop, `CONFIRM_*` error codes). Authorize in the server action instead.
- Avoid a client-side crash when a browser's WebMCP bridge lacks EventTarget methods.
- Never throw out of `useModelContextTools()` when a browser bridge has no `getTools`, throws from it, or returns an array synchronously; ignore a non-`AbortSignal` `options.signal` passed to `execute`.
