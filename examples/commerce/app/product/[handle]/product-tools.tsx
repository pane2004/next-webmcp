"use client";

import { ModelContext } from "nextjs-webmcp";
import { useCart } from "components/cart/cart-context";
import type { Product } from "lib/shopify/types";
import { useMemo } from "react";
import { createProductTools } from "./tools";

/**
 * Registers `get_product` and `add_to_cart` for the product being viewed.
 * Rebuilt when the product or the cart changes (same tool identity, so no
 * re-registration). Renders nothing visible; unmounting (navigating away)
 * unregisters the tools. Must render inside `<CartProvider>`.
 *
 * @example
 * <Suspense fallback={null}><ProductTools product={product} /></Suspense>
 * @see app/product/[handle]/tools.ts
 */
export function ProductTools({ product }: { product: Product }) {
  const cartApi = useCart();
  const tools = useMemo(() => createProductTools(product, cartApi), [product, cartApi]);
  return <ModelContext tools={tools} />;
}
