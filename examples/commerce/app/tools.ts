import { z } from "zod";
import { defineTools, tool, type ToolDef } from "next-webmcp";
import { startTransition } from "react";
import { removeItem, updateItemQuantity } from "components/cart/actions";
import type { useCart } from "components/cart/cart-context";
import { DEFAULT_OPTION } from "lib/constants";
import type { Cart, CartItem } from "lib/shopify/types";
import { searchProducts } from "./actions";

/*
 * Cart bridge
 * ----------
 * Tool definitions are static module values, but the cart lives in React state
 * (`useCart()`). `<CartTools>` publishes the latest cart API here after every
 * commit so tool `execute` functions always read fresh state without the tools
 * being rebuilt per render. No `document`/`window` access at module scope.
 */

/** The value returned by `useCart()`, mirrored for tools. */
export type CartBridge = ReturnType<typeof useCart>;

const bridge: { current: CartBridge | null } = { current: null };

/**
 * Publishes the current cart API so root and product tools can read/update the cart.
 * Called from `<CartTools>` in a layout effect; never call this from a tool.
 *
 * @example
 * useLayoutEffect(() => publishCartBridge(cartApi), [cartApi]);
 * @see components/cart/cart-tools.tsx
 */
export function publishCartBridge(value: CartBridge): void {
  bridge.current = value;
}

/**
 * Reads the latest cart API. Throws an actionable message when the cart
 * provider has not mounted yet, which `next-webmcp` turns into a tool error string.
 *
 * @example
 * const { cart, addCartItem } = readCartBridge();
 * @see publishCartBridge
 */
export function readCartBridge(): CartBridge {
  if (!bridge.current) {
    throw new Error("The cart is still loading. Wait a moment and call again");
  }
  return bridge.current;
}

/**
 * Runs cart work inside a React transition so `useOptimistic` updates stick
 * until the awaited server action settles and the refreshed cart arrives.
 *
 * @example
 * await runCartTransition(async () => { addCartItem(variant, product); await addItem(null, variant.id); });
 */
export function runCartTransition(work: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    startTransition(async () => {
      try {
        await work();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** Human-readable name for a cart line, e.g. `Acme Shirt (Blue / M)`. */
export function cartLineLabel(line: CartItem): string {
  const variantTitle = line.merchandise.title;
  return variantTitle && variantTitle !== DEFAULT_OPTION
    ? `${line.merchandise.product.title} (${variantTitle})`
    : line.merchandise.product.title;
}

/** Formats a money amount string to two decimals. */
export function formatAmount(amount: string | number): string {
  return Number(amount).toFixed(2);
}

function listLabels(cart: Cart): string {
  return cart.lines.map(cartLineLabel).join(", ");
}

type LineMatch = { kind: "one"; line: CartItem } | { kind: "error"; message: string };

/**
 * Finds one cart line by a natural-language name: exact label first, then a
 * case-insensitive substring over product title, variant title and handle.
 */
export function matchCartLine(cart: Cart | undefined, item: string): LineMatch {
  if (!cart || cart.lines.length === 0) {
    return {
      kind: "error",
      message: "The cart is empty. Add an item with add_to_cart on a product page first.",
    };
  }
  const needle = item.trim().toLowerCase();
  if (!needle) {
    return {
      kind: "error",
      message: `Provide the item's name. The cart contains: ${listLabels(cart)}.`,
    };
  }

  const exact = cart.lines.filter((line) => cartLineLabel(line).toLowerCase() === needle);
  if (exact.length === 1) return { kind: "one", line: exact[0]! };

  const partial = cart.lines.filter((line) =>
    [
      cartLineLabel(line),
      line.merchandise.product.title,
      line.merchandise.title,
      line.merchandise.product.handle,
    ].some((text) => text.toLowerCase().includes(needle)),
  );

  if (partial.length === 1) return { kind: "one", line: partial[0]! };
  if (partial.length > 1) {
    return {
      kind: "error",
      message: `Several cart items match "${item}": ${partial
        .map(cartLineLabel)
        .join(", ")}. Call again with one of those exact names.`,
    };
  }
  return {
    kind: "error",
    message: `No cart item matches "${item}". The cart contains: ${listLabels(cart)}. Use one of those names.`,
  };
}

const NAMED_DESTINATIONS = {
  home: "/",
  search: "/search",
  checkout: "/checkout",
  learn: "/learn",
} as const;

type NamedDestination = keyof typeof NAMED_DESTINATIONS;

/**
 * Maps a named destination or a site path to a same-origin path. Anything the URL
 * parser would send to another origin (`//evil.com`, `/\\evil.com`, `/..\\`) is
 * rejected so a prompt-injected agent cannot hard-navigate the shopper off-site.
 */
function resolveDestination(destination: string, origin: string): string | null {
  const key = destination.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NAMED_DESTINATIONS, key)) {
    return NAMED_DESTINATIONS[key as NamedDestination];
  }
  if (!destination.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(destination, origin);
  } catch {
    return null;
  }
  // A normalized pathname of "//host" would be pushed as a protocol-relative URL, so reject it too.
  if (url.origin !== origin || url.pathname.startsWith("//")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Tools registered on every page (root layout): catalog search, cart reads and
 * edits, navigation and checkout. Product- and search-specific tools live next
 * to their routes.
 *
 * @example
 * <ModelContext tools={rootTools} />
 * @see components/cart/cart-tools.tsx
 */
export const rootTools: ToolDef[] = defineTools({
  search_products: tool({
    description:
      "Search the Acme catalog by keyword, with an optional maximum price. Returns matching products with their page path, price range, and available options (Color, Size). Use it before add_to_cart to find the product page to open with navigate_to.",
    input: z.object({
      query: z.string().min(1).describe('Keyword to search for, such as "shirt", "hat" or "mug".'),
      maxPrice: z
        .number()
        .positive()
        .optional()
        .describe("Only include products whose lowest price is at most this amount."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(8)
        .describe("Maximum number of products to return (1–20)."),
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => async (input) => {
      const hits = await searchProducts(input);
      if (hits.length === 0) {
        return `No products matched "${input.query}". Try a broader term such as "shirt" or "hat".`;
      }
      return JSON.stringify(hits);
    },
  }),

  get_cart: tool({
    description:
      "Read the shopping cart: each line's item name, quantity, unit price and line total, plus the subtotal and total quantity. Use the returned item names with update_quantity or remove_item.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    execute: () => async () => {
      const { cart } = readCartBridge();
      if (!cart || cart.lines.length === 0) {
        return "The cart is empty.";
      }
      const currency = cart.cost.totalAmount.currencyCode;
      return JSON.stringify({
        lines: cart.lines.map((line) => ({
          item: cartLineLabel(line),
          quantity: line.quantity,
          unitPrice: formatAmount(Number(line.cost.totalAmount.amount) / line.quantity),
          lineTotal: formatAmount(line.cost.totalAmount.amount),
        })),
        subtotal: formatAmount(cart.cost.subtotalAmount.amount),
        currency,
        totalQuantity: cart.totalQuantity,
        hint: "Use update_quantity or remove_item with the item's name.",
      });
    },
  }),

  navigate_to: tool({
    description:
      'Open another page of the store. Accepts a named destination (home, search, checkout, learn) or a site path starting with "/" such as "/product/acme-cup" or "/search?q=shirt". Product pages add get_product and add_to_cart tools; search pages add refine_results.',
    input: z.object({
      destination: z
        .union([
          z.enum(["home", "search", "checkout", "learn"]),
          z.string().regex(/^\/(?![/\\])/, 'A site path starting with a single "/"'),
        ])
        .describe('One of "home", "search", "checkout", "learn", or a path starting with "/".'),
    }),
    execute: (ctx) => async (input) => {
      // Tools only run in the browser, so window is safe here (never at module scope).
      const path = resolveDestination(input.destination, window.location.origin);
      if (!path) {
        return `Unknown destination "${input.destination}". Use home, search, checkout, learn, or a site path starting with "/" such as "/product/acme-cup".`;
      }
      // Return first, then navigate: a navigation during execute makes
      // Chrome's executeTool resolve to null instead of this string.
      setTimeout(() => ctx.router.push(path), 0);
      return `Navigating to ${path}.`;
    },
  }),

  update_quantity: tool({
    description:
      "Set the quantity of an item already in the cart, matched by its name from get_cart (a product title, variant or handle also works). Quantity 0 removes the item.",
    input: z.object({
      item: z
        .string()
        .min(1)
        .describe('Item name as shown by get_cart, e.g. "Acme Shirt (Blue / M)".'),
      quantity: z.number().int().min(0).describe("New quantity for the item; 0 removes it."),
    }),
    execute: () => async (input) => {
      const { cart, updateCartItem } = readCartBridge();
      const match = matchCartLine(cart, input.item);
      if (match.kind === "error") return match.message;

      const { line } = match;
      const label = cartLineLabel(line);
      const delta = input.quantity - line.quantity;
      if (delta === 0) {
        return `${label} already has quantity ${input.quantity}. Cart has ${cart!.totalQuantity} items.`;
      }

      let failure: string | undefined;
      await runCartTransition(async () => {
        if (input.quantity === 0) {
          updateCartItem(line.merchandise.id, "delete");
        } else {
          const step = delta > 0 ? "plus" : "minus";
          for (let i = 0; i < Math.abs(delta); i++) {
            updateCartItem(line.merchandise.id, step);
          }
        }
        failure = await updateItemQuantity(null, {
          merchandiseId: line.merchandise.id,
          quantity: input.quantity,
        });
      });
      if (failure) {
        return `Could not update ${label}: ${failure}. Call get_cart to see the current state and try again.`;
      }

      const total = cart!.totalQuantity + delta;
      return input.quantity === 0
        ? `Removed ${label}. Cart now has ${total} items.`
        : `Updated ${label} to quantity ${input.quantity}. Cart now has ${total} items.`;
    },
  }),

  remove_item: tool({
    description:
      "Remove an item from the cart entirely, matched by its name from get_cart (a product title, variant or handle also works).",
    input: z.object({
      item: z
        .string()
        .min(1)
        .describe('Item name as shown by get_cart, e.g. "Acme Shirt (Blue / M)".'),
    }),
    execute: () => async (input) => {
      const { cart, updateCartItem } = readCartBridge();
      const match = matchCartLine(cart, input.item);
      if (match.kind === "error") return match.message;

      const { line } = match;
      const label = cartLineLabel(line);
      let failure: string | undefined;
      await runCartTransition(async () => {
        updateCartItem(line.merchandise.id, "delete");
        failure = await removeItem(null, line.merchandise.id);
      });
      if (failure) {
        return `Could not remove ${label}: ${failure}. Call get_cart to see the current state and try again.`;
      }
      const total = cart!.totalQuantity - line.quantity;
      return `Removed ${label}. Cart now has ${total} items.`;
    },
  }),

  start_checkout: tool({
    description:
      "Hand the current cart to checkout and open the checkout page. Asks the shopper to approve first. Requires at least one item in the cart.",
    input: z.object({}),
    confirm: () => {
      const cart = bridge.current?.cart;
      const lines = cart?.lines ?? [];
      return {
        title: "Start checkout",
        description: "Hands the current cart to checkout.",
        details: [
          ...lines.map((line) => ({
            label: cartLineLabel(line),
            value: `${line.quantity} × ${formatAmount(
              Number(line.cost.totalAmount.amount) / line.quantity,
            )} ${line.cost.totalAmount.currencyCode}`,
          })),
          {
            label: "Total",
            value: cart
              ? `${formatAmount(cart.cost.totalAmount.amount)} ${cart.cost.totalAmount.currencyCode}`
              : "0.00",
          },
        ],
      };
    },
    execute: (ctx) => async () => {
      const { cart } = readCartBridge();
      if (!cart || cart.lines.length === 0) {
        return "The cart is empty. Add an item before starting checkout.";
      }
      // Return before navigating so Chrome hands this string back to the agent.
      setTimeout(() => ctx.router.push("/checkout"), 0);
      return "Checkout started. Opening the checkout page.";
    },
  }),
});
