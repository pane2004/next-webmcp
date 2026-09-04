# example-minimal

The smallest useful next-webmcp app: a todo list with two tools and a manifest route.

- `get_time` — read-only, returns an ISO-8601 string.
- `add_todo` — runs the `addTodo` server action after the user approves a confirm card.
- `GET /.well-known/webmcp.json` — the manifest, built from the same `tools` array.

```sh
pnpm install             # from the repo root
pnpm build               # builds next-webmcp into dist/, which this app links to
pnpm example:minimal     # http://localhost:3000
```

Open Chrome with `chrome://flags/#enable-webmcp-testing` and use the DevTools panel in the corner to run the
tools. Files:

```
app/tools.ts                          tool definitions (defineTools + tool)
app/actions.ts                        "use server" actions used by the tools and the form
app/todos.ts                          in-memory store
app/providers.tsx                     client wrapper mounting <ModelContext> (renders the approval card) and <WebMCPDevTools>
app/layout.tsx                        root layout
app/page.tsx                          server component rendering the list
app/.well-known/webmcp.json/route.ts  createManifestHandler({ "/": tools })
```
