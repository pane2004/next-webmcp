import type { NextConfig } from "next";
import { withWebMCP } from "next-webmcp/config";

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    inlineCss: true,
    useCache: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
    ],
  },
};

const emptyInput = { type: "object", properties: {}, additionalProperties: false } as const;

// Writes public/.well-known/webmcp.json at config-load time. The manifest is plain data:
// next.config.ts cannot import app/tools.ts (it pulls in "use server" actions), so keep the
// names and descriptions in sync with app/tools.ts, app/product/[handle]/tools.ts and
// app/search/tools.ts by hand.
export default withWebMCP(nextConfig, {
  manifest: {
    routes: [
      {
        route: "/",
        tools: [
          {
            name: "search_products",
            description:
              "Search the Acme catalog by keyword, with an optional maximum price. Returns matching products with their page path, price range, and available options (Color, Size).",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", minLength: 1, description: "Keyword to search for." },
                maxPrice: {
                  type: "number",
                  exclusiveMinimum: 0,
                  description: "Only include products whose lowest price is at most this amount.",
                },
                limit: {
                  type: "integer",
                  minimum: 1,
                  maximum: 20,
                  default: 8,
                  description: "Maximum number of products to return (1–20).",
                },
              },
              required: ["query"],
              additionalProperties: false,
            },
          },
          {
            name: "get_cart",
            description:
              "Read the shopping cart: each line's item name, quantity, unit price and line total, plus the subtotal and total quantity.",
            inputSchema: emptyInput,
          },
          {
            name: "navigate_to",
            description:
              'Open another page of the store. Accepts a named destination (home, search, checkout, learn) or a site path starting with "/".',
            inputSchema: {
              type: "object",
              properties: {
                destination: {
                  type: "string",
                  description:
                    'One of "home", "search", "checkout", "learn", or a path starting with "/".',
                },
              },
              required: ["destination"],
              additionalProperties: false,
            },
          },
          {
            name: "update_quantity",
            description:
              "Set the quantity of an item already in the cart, matched by its name from get_cart. Quantity 0 removes the item.",
            inputSchema: {
              type: "object",
              properties: {
                item: { type: "string", minLength: 1, description: "Item name from get_cart." },
                quantity: { type: "integer", minimum: 0, description: "New quantity; 0 removes." },
              },
              required: ["item", "quantity"],
              additionalProperties: false,
            },
          },
          {
            name: "remove_item",
            description:
              "Remove an item from the cart entirely, matched by its name from get_cart.",
            inputSchema: {
              type: "object",
              properties: {
                item: { type: "string", minLength: 1, description: "Item name from get_cart." },
              },
              required: ["item"],
              additionalProperties: false,
            },
          },
          {
            name: "start_checkout",
            description:
              "Hand the current cart to checkout and open the checkout page. Asks the shopper to approve first.",
            inputSchema: emptyInput,
          },
          {
            name: "subscribe_newsletter",
            description:
              "Subscribe an email address to the Acme newsletter. (Declarative form tool.)",
            inputSchema: {
              type: "object",
              properties: { email: { type: "string", description: "Email address." } },
              required: ["email"],
            },
          },
        ],
      },
      {
        route: "/product/[handle]",
        tools: [
          {
            name: "get_product",
            description:
              "Read the product on the current page: title, description, price range, options, variants with price and stock, and the selected options.",
            inputSchema: emptyInput,
          },
          {
            name: "add_to_cart",
            description:
              "Add this page's product to the cart, choosing options by name (matched case-insensitively) or using the selection shown on the page.",
            inputSchema: {
              type: "object",
              properties: {
                options: {
                  type: "object",
                  additionalProperties: { type: "string" },
                  description: 'Option name to value, e.g. { "Color": "Blue", "Size": "9" }.',
                },
                quantity: {
                  type: "integer",
                  minimum: 1,
                  default: 1,
                  description: "How many to add (default 1).",
                },
              },
              additionalProperties: false,
            },
          },
        ],
      },
      {
        route: "/search",
        tools: [
          {
            name: "refine_results",
            description:
              "Change how the search results are shown: sort them and/or switch to a collection by handle or title.",
            inputSchema: {
              type: "object",
              properties: {
                sort: {
                  type: "string",
                  enum: ["relevance", "trending-desc", "latest-desc", "price-asc", "price-desc"],
                  description: "Sort order.",
                },
                collection: {
                  type: "string",
                  minLength: 1,
                  description: "Collection handle or title.",
                },
              },
              additionalProperties: false,
            },
          },
        ],
      },
    ],
  },
});
