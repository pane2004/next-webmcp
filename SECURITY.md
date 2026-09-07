# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/pane2004/next-webmcp/security/advisories/new). Do not open a
public issue. You should receive an acknowledgement within a few days.

## Threat model in one paragraph

next-web-mcp exposes browser-side tools whose bodies are your server actions, executed in the user's own
session. An agent calling a tool has exactly the permissions of the signed-in user, no more. The library adds
no network surface, stores nothing, and does not transmit tool definitions anywhere; `document.modelContext` is
the only integration point.

## Guidance for tool authors

- **Authorize in the server action.** Anything that spends money, sends messages, deletes data or changes
  account state must check the user's session and permissions on the server. There is no in-page approval
  step: an agent that drives the browser could click through one anyway.
- **Validate on the server too.** Zod validation in `<ModelContext>` protects the agent from bad arguments, not
  your action from a hostile client. Wrap actions in `toolAction()` so they validate their own input.
- **Mark untrusted output.** If a tool returns content that originated from third parties (reviews, user
  comments, external search results), set `annotations.untrustedContentHint: true`. Agents use this to treat
  the result as data rather than instructions, which reduces prompt-injection risk.
- **Mark read-only tools.** `annotations.readOnlyHint: true` tells agents the tool has no side effects.
- **Do not leak internals in errors.** The library returns `<name> failed: <message>` and never a stack trace;
  keep `message` free of secrets and internal identifiers.
- **The manifest is public.** `/.well-known/webmcp.json` lists tool names, descriptions and input schemas
  for anyone who requests it. Keep secrets and internal identifiers out of descriptions and schemas.
- **Origin-trial tokens are public by design.** They only work on the registered origin. Committing one is
  fine; committing API keys is not.

## Supported versions

Only the latest published `next-web-mcp` release receives fixes.
