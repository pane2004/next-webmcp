# Changelog

## 0.1.0 (unreleased)

Initial release.

- Avoid a client-side crash when a browser's WebMCP bridge lacks EventTarget methods.
- Never throw out of `useModelContextTools()` when a browser bridge has no `getTools`, throws from it, or returns an array synchronously; ignore a non-`AbortSignal` `options.signal` passed to `execute`.
