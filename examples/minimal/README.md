# example-minimal

The smallest useful nextjs-webmcp app: a todo list with three tools and a manifest route.

- `get_time` — read-only, returns an ISO-8601 string.
- `add_todo` — runs the `addTodo` server action (wrapped in `toolAction` from `nextjs-webmcp/server`, so
  the server validates the input again).
- `navigate_to` — built with `navigationTool`; opens `/` or `/todos/[id]`.
- `GET /.well-known/webmcp.json` — the manifest, built from the same `tools` array.

```sh
pnpm install             # from the repo root
pnpm build               # builds nextjs-webmcp into dist/, which this app links to
pnpm example:minimal     # http://localhost:3000
```

Open Chrome with `chrome://flags/#enable-webmcp-testing` and use the DevTools panel in the corner to run the
tools. Files:

```
app/tools.ts                          tool definitions (defineTools + tool + navigationTool; unwrap() reads the action's result)
app/actions.ts                        "use server" actions used by the tools and the form (addTodo = toolAction(...))
app/todos.ts                          in-memory store and the todoInput schema shared by the tool and the action
app/todos/[id]/page.tsx               one todo; the dynamic route navigate_to can open
app/providers.tsx                     client wrapper mounting <ModelContext> and <WebMCPDevTools>
app/layout.tsx                        root layout
app/page.tsx                          server component rendering the list
app/.well-known/webmcp.json/route.ts  createManifestHandler({ "/": tools })
```
