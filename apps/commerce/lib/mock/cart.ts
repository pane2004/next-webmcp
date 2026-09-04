import { cookies } from "next/headers";
import type { Cart, CartItem, Money } from "../shopify/types";
import { findVariant } from "./catalog";

/**
 * Cookie-backed cart for mock mode.
 *
 * Two cookies: `cartId` (a UUID, same name the Shopify path uses) and `cart`,
 * a compact JSON array of `[variantId, quantity]` tuples. Line ids are the
 * variant ids, so `removeFromCart` / `updateCart` receive them unchanged.
 *
 * `getCart()` only reads cookies and can run anywhere on the server. The
 * mutators call `cookies().set()`, which Next.js only allows inside Server
 * Actions and Route Handlers; the template already calls them from
 * `components/cart/actions.ts`, so that constraint is respected.
 *
 * @example
 * // in a server action
 * await addToCart([{ merchandiseId: "variant-acme-mug-default", quantity: 2 }]);
 * @see ../shopify/storefront.ts for the Shopify counterparts.
 */

export const CART_ID_COOKIE = "cartId";
export const CART_LINES_COOKIE = "cart";
export const CHECKOUT_PATH = "/checkout";

/** Browsers cap cookies around 4 KB; stay well under it. */
const MAX_COOKIE_BYTES = 3000;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CURRENCY = "USD";

type CartLineTuple = [variantId: string, quantity: number];

type CookieStore = Awaited<ReturnType<typeof cookies>>;

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  maxAge: COOKIE_MAX_AGE_SECONDS,
};

function money(amount: number): Money {
  return { amount: amount.toFixed(2), currencyCode: CURRENCY };
}

function parseLines(raw: string | undefined): CartLineTuple[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CartLineTuple =>
        Array.isArray(entry) &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "number" &&
        entry[1] > 0,
    );
  } catch {
    return [];
  }
}

function writeLines(store: CookieStore, lines: CartLineTuple[]): void {
  const serialized = JSON.stringify(lines);
  if (serialized.length > MAX_COOKIE_BYTES) {
    throw new Error("Cart is full. Remove some items before adding more.");
  }
  store.set(CART_LINES_COOKIE, serialized, cookieOptions);
}

function buildCart(cartId: string, tuples: CartLineTuple[]): Cart {
  const lines: CartItem[] = [];

  for (const [variantId, quantity] of tuples) {
    const hit = findVariant(variantId);
    if (!hit) continue; // stale cookie entry; drop silently
    const { product, variant } = hit;

    lines.push({
      id: variantId,
      quantity,
      cost: { totalAmount: money(Number(variant.price.amount) * quantity) },
      merchandise: {
        id: variant.id,
        title: variant.title,
        selectedOptions: variant.selectedOptions,
        product: {
          id: product.id,
          handle: product.handle,
          title: product.title,
          featuredImage: product.featuredImage,
        },
      },
    });
  }

  const total = lines.reduce((sum, line) => sum + Number(line.cost.totalAmount.amount), 0);

  return {
    id: cartId,
    checkoutUrl: CHECKOUT_PATH,
    cost: {
      subtotalAmount: money(total),
      totalAmount: money(total),
      totalTaxAmount: money(0),
    },
    lines,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/** Returns the current cart id, creating and persisting one if needed. */
function ensureCartId(store: CookieStore): string {
  const existing = store.get(CART_ID_COOKIE)?.value;
  if (existing) return existing;
  const id = globalThis.crypto.randomUUID();
  store.set(CART_ID_COOKIE, id, cookieOptions);
  return id;
}

/** @see ../shopify/storefront.ts#createCart */
export async function createCart(): Promise<Cart> {
  const store = await cookies();
  const id = globalThis.crypto.randomUUID();
  store.set(CART_ID_COOKIE, id, cookieOptions);
  writeLines(store, []);
  return buildCart(id, []);
}

/** @see ../shopify/storefront.ts#getCart */
export async function getCart(): Promise<Cart | undefined> {
  const store = await cookies();
  const cartId = store.get(CART_ID_COOKIE)?.value;
  if (!cartId) return undefined;
  return buildCart(cartId, parseLines(store.get(CART_LINES_COOKIE)?.value));
}

/** @see ../shopify/storefront.ts#addToCart */
export async function addToCart(
  lines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const store = await cookies();
  const cartId = ensureCartId(store);
  const current = parseLines(store.get(CART_LINES_COOKIE)?.value);

  for (const { merchandiseId, quantity } of lines) {
    if (!findVariant(merchandiseId)) {
      throw new Error(`Unknown variant: ${merchandiseId}`);
    }
    const existing = current.find(([id]) => id === merchandiseId);
    if (existing) {
      existing[1] += quantity;
    } else {
      current.push([merchandiseId, quantity]);
    }
  }

  const next = current.filter(([, quantity]) => quantity > 0);
  writeLines(store, next);
  return buildCart(cartId, next);
}

/** @see ../shopify/storefront.ts#removeFromCart */
export async function removeFromCart(lineIds: string[]): Promise<Cart> {
  const store = await cookies();
  const cartId = ensureCartId(store);
  const next = parseLines(store.get(CART_LINES_COOKIE)?.value).filter(
    ([id]) => !lineIds.includes(id),
  );
  writeLines(store, next);
  return buildCart(cartId, next);
}

/** @see ../shopify/storefront.ts#updateCart */
export async function updateCart(
  lines: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const store = await cookies();
  const cartId = ensureCartId(store);
  let current = parseLines(store.get(CART_LINES_COOKIE)?.value);

  for (const { id, merchandiseId, quantity } of lines) {
    current = current.filter(([lineId]) => lineId !== id);
    if (quantity > 0) {
      if (!findVariant(merchandiseId)) {
        throw new Error(`Unknown variant: ${merchandiseId}`);
      }
      current.push([merchandiseId, quantity]);
    }
  }

  writeLines(store, current);
  return buildCart(cartId, current);
}

/**
 * Empties the cart (used by the mock checkout after an order is placed).
 * Keeps the `cartId` cookie so the UI does not create a new cart.
 *
 * @example
 * // in a server action
 * await clearCart();
 */
export async function clearCart(): Promise<void> {
  const store = await cookies();
  writeLines(store, []);
}
