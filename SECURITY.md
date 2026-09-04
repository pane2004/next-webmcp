# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/pane2004/next-webmcp/security/advisories/new). Do not open a
public issue. You should receive an acknowledgement within a few days.

## Threat model in one paragraph

next-webmcp exposes browser-side tools whose bodies are your server actions, executed in the user's own
session. An agent calling a tool has exactly the permissions of the signed-in user, no more. The library adds
no network surface, stores nothing, and does not transmit tool definitions anywhere; `document.modelContext` is
the only integration point.

## Guidance for tool authors

- **Gate consequential actions.** Use `confirm` for anything that spends money, sends messages, deletes data,
  or changes account state. The approval card shows the arguments to the user before the action runs.
- **Validate on the server too.** Zod validation in `<ModelContext>` protects the agent from bad arguments, not
  your action from a hostile client. Server actions must validate their own input.
- **Mark untrusted output.** If a tool returns content that originated from third parties (reviews, user
  comments, external search results), set `annotations.untrustedContentHint: true`. Agents use this to treat
  the result as data rather than instructions, which reduces prompt-injection risk.
- **Mark read-only tools.** `annotations.readOnlyHint: true` lets agents plan without asking for approval.
- **Do not leak internals in errors.** The library returns `<name> failed: <message>` and never a stack trace;
  keep `message` free of secrets and internal identifiers.
- **Origin-trial tokens are public by design.** They only work on the registered origin. Committing one is
  fine; committing API keys is not.

## Supported versions

Only the latest published `next-webmcp` release receives fixes.
