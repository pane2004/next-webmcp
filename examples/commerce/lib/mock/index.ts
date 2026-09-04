/**
 * In-memory commerce provider used when Shopify credentials are absent.
 * Exposes the same function names and signatures as
 * `lib/shopify/storefront.ts`; `lib/shopify/index.ts` picks one of the two.
 *
 * Server-only: `./cart` reads and writes request cookies.
 *
 * @example
 * import * as mock from "lib/mock";
 * const shoes = await mock.getProducts({ query: "shoes" });
 * @see ../shopify/index.ts
 */
export { addToCart, clearCart, createCart, getCart, removeFromCart, updateCart } from "./cart";
export { getMenu } from "./menus";
export { getPage, getPages } from "./pages";
export {
  getCollection,
  getCollectionProducts,
  getCollections,
  getProduct,
  getProductRecommendations,
  getProducts,
} from "./products";
export { revalidate } from "./revalidate";
