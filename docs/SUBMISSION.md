# Devpost submission

## Project text (≤ 500 words)

**next-webmcp: route-scoped WebMCP tools for Next.js, backed by your server actions.**

**Why WebMCP fit.** Most "agent integrations" bolt a second API onto a product: a separate MCP server, its
own auth, and a copy of the business logic. WebMCP flips that. The page itself tells the agent what it can do
here, right now, and the agent acts through the same code paths a person uses. That is exactly the shape of a
Next.js App Router app: each route segment already knows its own state and already has server actions for
its own mutations. next-webmcp makes the mapping direct. A `layout.tsx` or `page.tsx` declares its tools; the
tools register when the segment mounts and unregister when it unmounts; and `execute` calls the server action
that the button next to it calls. There is no extra server and no OAuth because the tool runs inside the
user's own session.

**Better UX.** Agents stop guessing at DOM structure. Instead of scrolling a product grid and clicking the
element that looks like "Add to cart", an agent on `/product/acme-slip-on` sees `add_to_cart` with a JSON
Schema that names the variant and quantity, and `get_product` that returns the data it needs to choose. For
consequential actions, `confirm: true` puts an approval card in the page. The person sees what the agent is
about to do, with the arguments, and approves with Enter or denies with Escape. Actions that fail return
plain-language errors an agent can act on, never stack traces.

**What people and agents do together that was hard before.** In the demo storefront a person can say "find
blue slip-on shoes in size 9 under $80, add them to my cart, then start checkout." The agent calls
`search_products`, navigates, calls `get_product` and `add_to_cart`, and then hits `start_checkout`, which
pauses for the person to approve. The person keeps the final decision; the agent does the tedious part. Because
tools are route-scoped, the person can also just browse, and the agent's toolset follows them from page to
page. The `/learn` route shows this live.

**How WebMCP was implemented.** The library is a thin, honest layer over the Chrome API. `<ModelContext>`
feature-detects `document.modelContext`, converts Zod schemas with `z.toJSONSchema`, and calls
`registerTool(tool, { signal })` with one `AbortController` per mount. Unregistration is an abort. Input is
validated with `safeParse` before the action runs. The `Form` wrapper spreads `toolname` and `tooldescription`
onto `next/form` and answers agent submits with `e.respondWith(actionPromise)`. The DevTools panel is built
only on `getTools()`, the `toolchange` event, and `executeTool()`, so it doubles as a spec conformance check. A
`withWebMCP` config helper writes `public/.well-known/webmcp.json`. The demo is served under a registered
Chrome origin trial, so judges need no flag; the ChatGPT desktop browser supports WebMCP natively.

Everything is MIT, typed, tested with a fake `document.modelContext`, and documented with a contract that
records the spec facts we verified.

## Video script (< 3 minutes)

| Time      | Shot                                                                                                                                                                                                                                              | Voice-over                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | Title card, then `app/tools.ts` in the editor: `search_products` and `start_checkout` visible.                                                                                                                                                    | "next-webmcp lets a Next.js app declare WebMCP tools per route, backed by the server actions it already has. Here's the whole definition."                         |
| 0:15–0:35 | Browser on `https://next-webmcp-commerce.vercel.app`, DevTools panel open, Tools tab.                                                                                                                                                             | "This is the storefront. The panel lists what the browser's `getTools()` reports right now: six root tools, grouped by route."                                     |
| 0:35–0:55 | Click a product. Panel updates: `get_product` and `add_to_cart` appear under `/product/[handle]`. Go back; they disappear.                                                                                                                        | "Navigate to a product and two tools register. Leave and they're gone. That's an AbortController per mount, nothing more."                                         |
| 0:55–1:20 | Agent prompt typed into the ChatGPT browser (or DevTools Run tab): "Find blue slip-on shoes in size 9 under $80 and add them to my cart, then start checkout." Calls tab shows `search_products` → `navigate_to` → `get_product` → `add_to_cart`. | "Now the task. The agent searches, navigates, reads the product and adds it. Every call is logged with its arguments and timing."                                  |
| 1:20–1:45 | `start_checkout` fires; the approval card appears with the cart total. Press Enter.                                                                                                                                                               | "`start_checkout` is marked `confirm`. The agent stops, the person decides. Enter approves, Escape denies, and the agent gets a plain-language answer either way." |
| 1:45–2:05 | `/learn` page: live tool list with route labels; footer newsletter form highlighted with `data-tool-active`.                                                                                                                                      | "`/learn` renders the same live list from `toolchange`. The newsletter form is a declarative tool: `next/form` plus two attributes, answered with `respondWith`."  |
| 2:05–2:30 | Editor: `next.config.ts` with `withWebMCP`, then `public/.well-known/webmcp.json`. Terminal: `pnpm test` green.                                                                                                                                   | "A config helper writes a manifest. Tests run against a fake `document.modelContext`, so CI doesn't need Chrome."                                                  |
| 2:30–2:50 | README spec-alignment table, then the GitHub repo.                                                                                                                                                                                                | "Every Chrome rule we verified maps to a line of code. MIT, on npm as `next-webmcp`. Thanks."                                                                      |

Shot list checklist: DevTools panel open · tools swapping on navigation · approval card for `start_checkout` ·
`/learn` page · Calls tab · `webmcp.json` · green test run.
