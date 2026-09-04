"use server";

import { TAGS } from "lib/constants";
import { clearCart } from "lib/mock/cart";
import { getCart } from "lib/shopify";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Places a mock order: empties the cart cookie and redirects to the
 * confirmation view. No personal data is read from the form.
 *
 * @example
 * <form action={placeOrder}><button>Place order</button></form>
 */
export async function placeOrder(): Promise<void> {
  const cart = await getCart();

  if (!cart || cart.lines.length === 0) {
    redirect("/checkout");
  }

  const orderId = globalThis.crypto.randomUUID().slice(0, 8).toUpperCase();

  await clearCart();
  updateTag(TAGS.cart);

  redirect(`/checkout?order=${orderId}`);
}
