# example-commerce

The next-web-mcp demo storefront, deployed at **https://next-webmcp-commerce.vercel.app**. A fork of
[vercel/commerce](https://github.com/vercel/commerce) (see [LICENSE.vercel-commerce.md](./LICENSE.vercel-commerce.md))
with WebMCP tools on every route:

| Route                             | Tools                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/` (root layout)                 | `search_products`, `get_cart`, `navigate_to`, `update_quantity`, `remove_item`, `start_checkout` |
| `/product/[handle]`               | `get_product`, `add_to_cart`                                                                     |
| `/search`, `/search/[collection]` | `refine_results`                                                                                 |
| footer (all routes)               | `subscribe_newsletter` (declarative `next-web-mcp/form`)                                         |
| `/learn`                          | page listing the tools registered right now                                                      |
| `/.well-known/webmcp.json`        | manifest served by `createManifestHandler`                                                       |

Where things live: `app/tools.ts` (root tools), `app/product/[handle]/tools.ts`, `app/search/tools.ts`,
`components/cart/cart-tools.tsx` (mounts the root `<ModelContext>` and the DevTools panel),
`components/newsletter/newsletter-form.tsx` (declarative form), `lib/webmcp-origin-trial.ts` (Chrome origin
trial token, public by design).

## Mock mode

Without `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_ACCESS_TOKEN` the app runs against the in-memory
catalog in `lib/mock` (seeded from the Acme demo store) — no environment variables, no accounts. Set both to
point the same UI at a real Shopify store.

## Run

```sh
pnpm install                 # from the repo root
pnpm build                   # builds next-web-mcp into dist/, which this app links to
pnpm example:commerce        # http://localhost:3000
```

Open it in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` (the deployed site needs no flag; it
ships an origin-trial token valid until 2026-11-16). The panel in the bottom-right corner lists the
registered tools, runs them, and logs every call.

Other scripts (run inside this directory or with `pnpm --filter example-commerce <script>`): `build`, `start`,
`typecheck`.
