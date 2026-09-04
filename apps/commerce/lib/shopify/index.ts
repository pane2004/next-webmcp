// Must run before any module reads process.env.SITE_NAME / COMPANY_NAME.
import "lib/mock/env";

import * as mock from "lib/mock";
import { isMockCommerce } from "lib/mock/mode";
import type { NextRequest, NextResponse } from "next/server";
import type { CommerceProvider } from "./provider";
import * as storefront from "./storefront";
import type { Cart, Collection, Menu, Page, Product } from "./types";

/**
 * Commerce data layer for the app.
 *
 * Picks a backend once at module load:
 * - Shopify Storefront API (`./storefront.ts`) when both
 *   `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_ACCESS_TOKEN` are set.
 *   Those functions keep their `use cache` / `cacheTag` semantics.
 * - The in-memory mock (`lib/mock`) otherwise, so the app runs with no
 *   configuration. Mock functions are plain async; the cart is cookie-backed.
 *
 * Every export below has the same signature in both backends
 * (enforced by `CommerceProvider`), so pages, components and WebMCP tools
 * never need to know which one is active.
 *
 * @see ./provider.ts
 * @see ../mock/index.ts
 */
const provider: CommerceProvider = isMockCommerce() ? mock : storefront;

/** Whether the in-memory mock backend is active (no Shopify credentials). */
export const isMock: boolean = provider === mock;

/**
 * Creates an empty cart and, in mock mode, sets the cart cookies.
 * Call from a Server Action or Route Handler only.
 *
 * @example
 * const cart = await createCart();
 * (await cookies()).set("cartId", cart.id!);
 */
export async function createCart(): Promise<Cart> {
  return provider.createCart();
}

/**
 * Adds variants to the current cart (identified by the `cartId` cookie).
 *
 * @example
 * await addToCart([{ merchandiseId: variantId, quantity: 1 }]);
 */
export async function addToCart(
  lines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  return provider.addToCart(lines);
}

/**
 * Removes lines from the current cart by line id.
 *
 * @example
 * await removeFromCart([lineItem.id]);
 */
export async function removeFromCart(lineIds: string[]): Promise<Cart> {
  return provider.removeFromCart(lineIds);
}

/**
 * Sets the quantity (or swaps the variant) of existing cart lines.
 *
 * @example
 * await updateCart([{ id: lineItem.id, merchandiseId, quantity: 2 }]);
 */
export async function updateCart(
  lines: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  return provider.updateCart(lines);
}

/**
 * Reads the current cart from the `cartId` cookie. `undefined` when there is
 * no cart yet (the cart modal then creates one).
 *
 * @example
 * const cart = await getCart();
 * cart?.totalQuantity;
 */
export async function getCart(): Promise<Cart | undefined> {
  return provider.getCart();
}

/**
 * Looks up a collection by handle, including `hidden-*` ones.
 *
 * @example
 * const apparel = await getCollection("apparel");
 */
export async function getCollection(handle: string): Promise<Collection | undefined> {
  return provider.getCollection(handle);
}

/**
 * Products in a collection, sorted with the search sort keys from
 * `lib/constants.ts`. Empty for unknown collections.
 *
 * @example
 * const featured = await getCollectionProducts({ collection: "hidden-homepage-featured-items" });
 */
export async function getCollectionProducts(args: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  return provider.getCollectionProducts(args);
}

/**
 * Visible collections, prefixed with the synthetic "All" entry (`/search`).
 *
 * @example
 * (await getCollections()).map((c) => c.path); // ["/search", "/search/apparel", ...]
 */
export async function getCollections(): Promise<Collection[]> {
  return provider.getCollections();
}

/**
 * Navigation items for a menu handle.
 *
 * @example
 * const header = await getMenu("next-js-frontend-header-menu");
 */
export async function getMenu(handle: string): Promise<Menu[]> {
  return provider.getMenu(handle);
}

/**
 * A content page by handle. Resolves to a nullish value at runtime for
 * unknown handles so callers can `notFound()`.
 *
 * @example
 * const about = await getPage("about");
 */
export async function getPage(handle: string): Promise<Page> {
  return provider.getPage(handle);
}

/**
 * All content pages (used by the sitemap).
 *
 * @example
 * const pages = await getPages();
 */
export async function getPages(): Promise<Page[]> {
  return provider.getPages();
}

/**
 * A product by handle, with variants and images flattened.
 *
 * @example
 * const shoes = await getProduct("acme-slip-on-shoes");
 */
export async function getProduct(handle: string): Promise<Product | undefined> {
  return provider.getProduct(handle);
}

/**
 * Related products for a product id.
 *
 * @example
 * const related = await getProductRecommendations(product.id);
 */
export async function getProductRecommendations(productId: string): Promise<Product[]> {
  return provider.getProductRecommendations(productId);
}

/**
 * Full-text product search with optional sorting.
 *
 * @example
 * const hits = await getProducts({ query: "shoes", sortKey: "PRICE", reverse: false });
 */
export async function getProducts(args: {
  query?: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  return provider.getProducts(args);
}

/**
 * Webhook-driven cache revalidation (`app/api/revalidate/route.ts`).
 * In mock mode it simply acknowledges the request.
 *
 * @example
 * export async function POST(req: NextRequest) { return revalidate(req); }
 */
export async function revalidate(req: NextRequest): Promise<NextResponse> {
  return provider.revalidate(req);
}

export { shopifyFetch } from "./storefront";
