import type { NextRequest, NextResponse } from "next/server";
import type { Cart, Collection, Menu, Page, Product } from "./types";

/**
 * The contract every commerce backend must satisfy. Both
 * `lib/shopify/storefront.ts` (Shopify Storefront API) and `lib/mock`
 * (in-memory) are checked against it in `lib/shopify/index.ts`, so a
 * signature drift in either fails `tsc` instead of surfacing at runtime.
 *
 * @example
 * import type { CommerceProvider } from "lib/shopify/provider";
 * const provider: CommerceProvider = await import("lib/mock");
 * @see ./index.ts
 */
export type CommerceProvider = {
  createCart(): Promise<Cart>;
  addToCart(lines: { merchandiseId: string; quantity: number }[]): Promise<Cart>;
  removeFromCart(lineIds: string[]): Promise<Cart>;
  updateCart(lines: { id: string; merchandiseId: string; quantity: number }[]): Promise<Cart>;
  getCart(): Promise<Cart | undefined>;
  getCollection(handle: string): Promise<Collection | undefined>;
  getCollectionProducts(args: {
    collection: string;
    reverse?: boolean;
    sortKey?: string;
  }): Promise<Product[]>;
  getCollections(): Promise<Collection[]>;
  getMenu(handle: string): Promise<Menu[]>;
  getPage(handle: string): Promise<Page>;
  getPages(): Promise<Page[]>;
  getProduct(handle: string): Promise<Product | undefined>;
  getProductRecommendations(productId: string): Promise<Product[]>;
  getProducts(args: { query?: string; reverse?: boolean; sortKey?: string }): Promise<Product[]>;
  revalidate(req: NextRequest): Promise<NextResponse>;
};
