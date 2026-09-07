"use server";

import { toolAction } from "nextjs-webmcp/server";
import { getProducts } from "lib/shopify";
import type { Product } from "lib/shopify/types";
import { newsletterInput, searchProductsInput } from "lib/tool-schemas";

/** One row of a `search_products` result: enough for an agent to pick a product and open its page. */
export type ProductSearchHit = {
  title: string;
  handle: string;
  path: string;
  price: { min: string; max: string; currency: string };
  options: Record<string, string[]>;
  available: boolean;
};

const OPTION_PLACEHOLDER = "Title";

function toHit(product: Product): ProductSearchHit {
  const options: Record<string, string[]> = {};
  for (const option of product.options) {
    if (option.name === OPTION_PLACEHOLDER) continue;
    options[option.name] = option.values;
  }
  return {
    title: product.title,
    handle: product.handle,
    path: `/product/${product.handle}`,
    price: {
      min: Number(product.priceRange.minVariantPrice.amount).toFixed(2),
      max: Number(product.priceRange.maxVariantPrice.amount).toFixed(2),
      currency: product.priceRange.minVariantPrice.currencyCode,
    },
    options,
    available: product.availableForSale,
  };
}

/**
 * Searches the catalog by keyword and optional maximum price.
 * Backs the `search_products` WebMCP tool; runs on the server so the catalog
 * provider stays out of the client bundle. `toolAction` validates the arguments
 * again here with the same schema the tool declares, so a request that skips
 * the browser-side check still gets a clamped `limit` and a non-empty `query`,
 * and the result is always `{ ok, data | error }` — the tool reads it with `unwrap()`.
 *
 * @example
 * const result = await searchProducts({ query: "shirt", maxPrice: 30, limit: 5 });
 * if (result.ok) result.data.map((hit) => hit.handle);
 * @see app/tools.ts search_products
 * @see lib/tool-schemas.ts searchProductsInput
 */
export const searchProducts = toolAction(
  searchProductsInput,
  async ({ query, maxPrice, limit }): Promise<ProductSearchHit[]> => {
    const products = await getProducts({ query });
    return products
      .filter(
        (product) =>
          maxPrice === undefined || Number(product.priceRange.minVariantPrice.amount) <= maxPrice,
      )
      .slice(0, limit)
      .map(toHit);
  },
);

const subscribeAction = toolAction(
  newsletterInput,
  async ({ email }) => `Subscribed ${email.toLowerCase()} to the newsletter.`,
);

/**
 * Validates and "subscribes" an email address to the newsletter. Demo only:
 * nothing is persisted. Takes `FormData` because the declarative
 * `subscribe_newsletter` form posts it; the returned string is what the agent
 * (through `respondWith`) and the visitor (under the form) both read, so a
 * validation failure comes back as `toolAction`'s sentence instead of a thrown error.
 *
 * @example
 * await subscribeToNewsletter(formData); // "Subscribed jane@example.com to the newsletter."
 * @see components/newsletter/newsletter-form.tsx
 * @see lib/tool-schemas.ts newsletterInput
 */
export async function subscribeToNewsletter(formData: FormData): Promise<string> {
  const result = await subscribeAction({ email: formData.get("email") });
  return result.ok ? result.data : result.error;
}
