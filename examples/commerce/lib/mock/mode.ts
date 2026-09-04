/**
 * Decides which commerce provider backs `lib/shopify`.
 *
 * Mock mode is active whenever the Shopify credentials are missing, so the
 * app runs out of the box with the in-memory catalog in `lib/mock`.
 * This module is safe to import from client and server code: it only reads
 * `process.env` when called, never at module scope.
 *
 * @example
 * import { isMockCommerce } from "lib/mock/mode";
 * if (isMockCommerce()) console.log("running against the in-memory catalog");
 * @see ./index.ts for the provider implementation.
 */
export function isMockCommerce(): boolean {
  return !(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN);
}
