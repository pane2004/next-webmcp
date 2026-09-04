"use server";

import { getProducts } from "lib/shopify";
import type { Product } from "lib/shopify/types";

/** One row of a `search_products` result: enough for an agent to pick a product and open its page. */
export type ProductSearchHit = {
  title: string;
  handle: string;
  path: string;
  price: { min: string; max: string; currency: string };
  options: Record<string, string[]>;
  available: boolean;
};

export type SearchProductsInput = {
  query: string;
  maxPrice?: number;
  /** 1–20; clamped server-side. */
  limit?: number;
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
 * provider stays out of the client bundle.
 *
 * @example
 * const hits = await searchProducts({ query: "shirt", maxPrice: 30, limit: 5 });
 * @see app/tools.ts
 */
export async function searchProducts(input: SearchProductsInput): Promise<ProductSearchHit[]> {
  const query = String(input.query ?? "").trim();
  const limit = Math.min(20, Math.max(1, Math.trunc(Number(input.limit) || 8)));
  const maxPrice =
    typeof input.maxPrice === "number" && Number.isFinite(input.maxPrice)
      ? input.maxPrice
      : undefined;

  const products = await getProducts({ query: query || undefined });

  return products
    .filter(
      (product) =>
        maxPrice === undefined || Number(product.priceRange.minVariantPrice.amount) <= maxPrice,
    )
    .slice(0, limit)
    .map(toHit);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validates and "subscribes" an email address to the newsletter.
 * Demo only: nothing is persisted; the returned string is what the agent
 * (via `subscribe_newsletter`) and the visitor (under the form) both read.
 *
 * @example
 * await subscribeToNewsletter(formData); // "Subscribed jane@example.com to the newsletter."
 * @see components/newsletter/newsletter-form.tsx
 */
export async function subscribeToNewsletter(formData: FormData): Promise<string> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!email) {
    return "Enter an email address to subscribe, for example name@example.com.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return `"${email}" is not a valid email address. Use the form name@example.com and try again.`;
  }

  return `Subscribed ${email} to the newsletter.`;
}
