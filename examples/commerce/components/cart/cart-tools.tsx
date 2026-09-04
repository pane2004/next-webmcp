"use client";

import { ModelContext } from "next-webmcp";
import { WebMCPDevTools } from "next-webmcp/devtools";
import { useLayoutEffect } from "react";
import { publishCartBridge, rootTools } from "app/tools";
import { useCart } from "./cart-context";

/**
 * Registers the root WebMCP tools and keeps them wired to the live cart.
 * Must render inside `<CartProvider>`. `<ModelContext>` renders the approval
 * card itself; this adds the DevTools panel (forced on so the demo shows it in
 * production too).
 *
 * @example
 * <CartProvider cartPromise={cart}>
 *   <Suspense fallback={null}><CartTools /></Suspense>
 * </CartProvider>
 * @see app/tools.ts
 */
export function CartTools() {
  const cartApi = useCart();

  useLayoutEffect(() => {
    publishCartBridge(cartApi);
  }, [cartApi]);

  return (
    <ModelContext tools={rootTools}>
      <WebMCPDevTools force position="bottom-right" />
    </ModelContext>
  );
}
