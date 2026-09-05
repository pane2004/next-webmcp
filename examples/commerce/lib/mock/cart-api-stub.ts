import type { CartApi } from "lib/cart-tools-helpers";
import type { Cart } from "lib/shopify/types";

const emptyCart: Cart = {
  id: undefined,
  checkoutUrl: "",
  totalQuantity: 0,
  lines: [],
  cost: {
    subtotalAmount: { amount: "0", currencyCode: "USD" },
    totalAmount: { amount: "0", currencyCode: "USD" },
    totalTaxAmount: { amount: "0", currencyCode: "USD" },
  },
};

/**
 * Stand-in for `useCart()` where no React tree exists (the manifest route handler).
 * The manifest only needs each tool's name, description and input schema; `execute`
 * and `confirm` never run there, so the cart stays empty and the mutators do nothing.
 *
 * @example
 * createRootTools(cartApiStub); // feeds buildManifest / createManifestHandler
 * @see app/.well-known/webmcp.json/route.ts
 */
export const cartApiStub: CartApi = {
  cart: emptyCart,
  updateCartItem: () => {},
  addCartItem: () => {},
};
