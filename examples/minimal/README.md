# example-minimal

The smallest useful next-webmcp app: a todo list with two tools.

- `get_time` — read-only, returns an ISO-8601 string.
- `add_todo` — runs the `addTodo` server action after the user approves a confirm card.

`next.config.ts` uses `withWebMCP` to write `public/.well-known/webmcp.json`.

```sh
pnpm install            # from the repo root
pnpm --filter next-webmcp build
pnpm --filter example-minimal dev   # http://localhost:3000
```

Open Chrome with `chrome://flags/#enable-webmcp-testing` and use the DevTools panel in the corner to run the
tools. Files:

```
app/tools.ts       tool definitions (defineTools + tool)
app/actions.ts     "use server" actions used by the tools and the form
app/todos.ts       in-memory store
app/providers.tsx  client wrapper mounting <ModelContext>, <ToolConfirmations>, <WebMCPDevTools>
app/layout.tsx     root layout
app/page.tsx       server component rendering the list
next.config.ts     withWebMCP + manifest
```
