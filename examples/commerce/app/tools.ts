import { z } from "zod";
import { defineTools, navigationTool, tool, unwrap, type ToolDef } from "next-web-mcp";
import { removeItem, updateItemQuantity } from "components/cart/actions";
import {
  cartLineLabel,
  formatAmount,
  matchCartLine,
  runCartTransition,
  type CartApi,
} from "lib/cart-tools-helpers";
import { searchProductsInput } from "lib/tool-schemas";
import { searchProducts } from "./actions";

/**
 * Builds the tools registered on every page (root layout): catalog search, cart
 * reads and edits, navigation and checkout. The cart tools close over `cartApi`,
 * so rebuild them whenever `useCart()` returns a new value. `next-web-mcp` keys
 * registration by tool identity (name, description, schema), so a rebuilt array
 * swaps in the fresh closures without re-registering anything. Product- and
 * search-specific tools live next to their routes.
 *
 * @example
 * const cartApi = useCart();
 * const tools = useMemo(() => createRootTools(cartApi), [cartApi]);
 * <ModelContext tools={tools} />
 * @see components/cart/cart-tools.tsx
 * @see lib/mock/cart-api-stub.ts for the manifest route, which has no React tree
 */
export function createRootTools(cartApi: CartApi): ToolDef[] {
  return defineTools({
    search_products: tool({
      description:
        "Search the Acme catalog by keyword, with an optional maximum price. Returns matching products with their handle, page path, price range, and available options (Color, Size). Use it before add_to_cart to find the product handle, then open the product page with navigate_to (route /product/[handle]).",
      // The same schema guards the server action, so the arguments are validated on both sides.
      input: searchProductsInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => async (input) => {
        // unwrap() throws the action's own sentence on failure, which <ModelContext> hands to the agent.
        const hits = unwrap(await searchProducts(input));
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
        const { cart } = cartApi;
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

    // An allowlist of route patterns: the agent cannot name a path outside it, and every
    // param is URL-encoded into its segment, so no input can send the shopper off-site.
    navigate_to: navigationTool({
      description:
        "Open another page of the store. Product pages add the get_product and add_to_cart tools; search pages add refine_results.",
      routes: [
        { path: "/", description: "Home page." },
        {
          path: "/search",
          description: "All products; add query q to search.",
          query: z.object({ q: z.string().optional() }),
        },
        {
          path: "/search/[collection]",
          description: "Products in a collection.",
          params: z.object({ collection: z.string() }),
        },
        {
          path: "/product/[handle]",
          description: "A product page (adds get_product and add_to_cart tools).",
          params: z.object({ handle: z.string() }),
        },
        { path: "/checkout", description: "Checkout page." },
        { path: "/learn", description: "How this store exposes tools to agents." },
      ],
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
        const { cart, updateCartItem } = cartApi;
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
        const { cart, updateCartItem } = cartApi;
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
        "Hand the current cart to checkout and open the checkout page. Requires at least one item in the cart.",
      input: z.object({}),
      execute: (ctx) => async () => {
        const { cart } = cartApi;
        if (!cart || cart.lines.length === 0) {
          return "The cart is empty. Add an item before starting checkout.";
        }
        // Return before navigating so Chrome hands this string back to the agent.
        setTimeout(() => ctx.router.push("/checkout"), 0);
        return "Checkout started. Opening the checkout page.";
      },
    }),
  });
}
