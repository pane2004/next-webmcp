"use client";

import { ModelContext } from "next-web-mcp";
import { WebMCPDevTools } from "next-web-mcp/devtools";
import { useMemo } from "react";
import { createRootTools } from "app/tools";
import { useCart } from "./cart-context";

/**
 * Registers the root WebMCP tools, rebuilt from the live cart. `useCart()` returns
 * a new value whenever the cart changes; the rebuilt tools keep their identity, so
 * `<ModelContext>` swaps in the fresh closures without re-registering. Must render
 * inside `<CartProvider>`. `<ModelContext>` renders the approval card itself; this
 * adds the DevTools panel (forced on so the demo shows it in production too).
 *
 * @example
 * <CartProvider cartPromise={cart}>
 *   <Suspense fallback={null}><CartTools /></Suspense>
 * </CartProvider>
 * @see app/tools.ts createRootTools
 */
export function CartTools() {
  const cartApi = useCart();
  const tools = useMemo(() => createRootTools(cartApi), [cartApi]);

  return (
    <ModelContext tools={tools}>
      <WebMCPDevTools force position="bottom-right" />
    </ModelContext>
  );
}
