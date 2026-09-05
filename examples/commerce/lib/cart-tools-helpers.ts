import { startTransition } from "react";
import type { useCart } from "components/cart/cart-context";
import { DEFAULT_OPTION } from "lib/constants";
import type { Cart, CartItem } from "lib/shopify/types";

/*
 * Shared by the root tools (app/tools.ts) and the product tools
 * (app/product/[handle]/tools.ts). Plain module: no components, no hooks,
 * no `document`/`window` access, so the manifest route can import it too.
 */

/**
 * The value returned by `useCart()`. Tool factories close over it, so each tool's
 * `execute` sees the cart as of the render that last rebuilt the tools.
 *
 * @example
 * const cartApi = useCart();
 * const tools = useMemo(() => createRootTools(cartApi), [cartApi]);
 * @see app/tools.ts createRootTools
 */
export type CartApi = ReturnType<typeof useCart>;

/**
 * Runs cart work inside a React transition so `useOptimistic` updates stick
 * until the awaited server action settles and the refreshed cart arrives.
 *
 * @example
 * await runCartTransition(async () => { addCartItem(variant, product); await addItem(null, variant.id); });
 * @see components/cart/cart-context.tsx useCart
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

/**
 * Human-readable name for a cart line, e.g. `Acme Shirt (Blue / M)`.
 *
 * @example
 * cartLineLabel(cart.lines[0]); // "Acme Shirt (Blue / M)"
 * @see matchCartLine
 */
export function cartLineLabel(line: CartItem): string {
  const variantTitle = line.merchandise.title;
  return variantTitle && variantTitle !== DEFAULT_OPTION
    ? `${line.merchandise.product.title} (${variantTitle})`
    : line.merchandise.product.title;
}

/**
 * Formats a money amount string to two decimals.
 *
 * @example
 * formatAmount("20"); // "20.00"
 */
export function formatAmount(amount: string | number): string {
  return Number(amount).toFixed(2);
}

function listLabels(cart: Cart): string {
  return cart.lines.map(cartLineLabel).join(", ");
}

/** Result of `matchCartLine`: one line, or a message that tells the agent what to send next. */
export type LineMatch = { kind: "one"; line: CartItem } | { kind: "error"; message: string };

/**
 * Finds one cart line by a natural-language name: exact label first, then a
 * case-insensitive substring over product title, variant title and handle.
 *
 * @example
 * const match = matchCartLine(cart, "shirt");
 * if (match.kind === "error") return match.message;
 * @see cartLineLabel
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
