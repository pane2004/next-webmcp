import { HIDDEN_PRODUCT_TAG } from "../constants";
import type { Collection, Product } from "../shopify/types";
import { getProductByHandle, getProductById, products } from "./catalog";
import {
  collectionProducts,
  collections,
  collectionsForProduct,
  getCollectionByHandle,
} from "./collections";

/**
 * Catalog read functions for mock mode. Signatures match
 * `lib/shopify/storefront.ts` exactly so `lib/shopify/index.ts` can switch
 * providers without touching callers.
 *
 * These are plain async functions (no `use cache`): the data is in memory,
 * so caching would add nothing.
 *
 * @see ../shopify/index.ts
 */

/** Shopify's search sort keys as used by `lib/constants.ts`. */
type SortKey = "RELEVANCE" | "BEST_SELLING" | "CREATED_AT" | "PRICE";

const minPrice = (product: Product): number => Number(product.priceRange.minVariantPrice.amount);

/**
 * Sorts a product list the way the Shopify Storefront API would.
 * RELEVANCE and BEST_SELLING keep catalog order (stable); CREATED_AT uses
 * `updatedAt`; PRICE uses the minimum variant price. `reverse` flips the result.
 *
 * @example
 * sortProducts(products, "PRICE", true)[0]?.title; // most expensive first
 */
export function sortProducts(list: Product[], sortKey?: string, reverse?: boolean): Product[] {
  const sorted = [...list];
  switch (sortKey as SortKey | undefined) {
    case "CREATED_AT":
      sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      break;
    case "PRICE":
      sorted.sort((a, b) => minPrice(a) - minPrice(b));
      break;
    default:
      break;
  }
  return reverse ? sorted.reverse() : sorted;
}

const haystack = (product: Product): string =>
  [
    product.title,
    product.handle,
    product.description,
    ...product.tags,
    ...product.options.flatMap((option) => [option.name, ...option.values]),
  ]
    .join(" ")
    .toLowerCase();

/**
 * Case-insensitive search over title, handle, description, tags and option
 * names/values. Every whitespace-separated term must match; when nothing
 * matches all terms, falls back to products matching any term so agent
 * queries like "blue shoes size 9" still return something useful.
 *
 * @example
 * searchProducts("shoes").map((p) => p.handle); // ["acme-slip-on-shoes"]
 */
export function searchProducts(query: string | undefined): Product[] {
  const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return products;

  const indexed = products.map((product) => ({
    product,
    text: haystack(product),
  }));
  const all = indexed.filter(({ text }) => terms.every((term) => text.includes(term)));
  const hits = all.length
    ? all
    : indexed.filter(({ text }) => terms.some((term) => text.includes(term)));
  return hits.map(({ product }) => product);
}

const visible = (product: Product): boolean => !product.tags.includes(HIDDEN_PRODUCT_TAG);

/** @see ../shopify/storefront.ts#getProducts */
export async function getProducts({
  query,
  reverse,
  sortKey,
}: {
  query?: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  return sortProducts(searchProducts(query).filter(visible), sortKey, reverse);
}

/** @see ../shopify/storefront.ts#getProduct */
export async function getProduct(handle: string): Promise<Product | undefined> {
  return getProductByHandle(handle);
}

/** @see ../shopify/storefront.ts#getCollection */
export async function getCollection(handle: string): Promise<Collection | undefined> {
  return getCollectionByHandle(handle);
}

/** @see ../shopify/storefront.ts#getCollectionProducts */
export async function getCollectionProducts({
  collection,
  reverse,
  sortKey,
}: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  if (!getCollectionByHandle(collection)) {
    console.log(`No collection found for \`${collection}\``);
    return [];
  }
  return sortProducts(collectionProducts(collection).filter(visible), sortKey, reverse);
}

/**
 * Mirrors the Shopify implementation: prepends the synthetic "All"
 * collection (path `/search`) and drops `hidden-*` collections.
 *
 * @see ../shopify/storefront.ts#getCollections
 */
export async function getCollections(): Promise<Collection[]> {
  return [
    {
      handle: "",
      title: "All",
      description: "All products",
      seo: {
        title: "All",
        description: "All products",
      },
      path: "/search",
      updatedAt: new Date().toISOString(),
    },
    ...collections.filter((collection) => !collection.handle.startsWith("hidden")),
  ];
}

/**
 * Up to four other products, preferring the same visible collection, then
 * shared tags, then the rest of the catalog.
 *
 * @see ../shopify/storefront.ts#getProductRecommendations
 */
export async function getProductRecommendations(productId: string): Promise<Product[]> {
  const product = getProductById(productId);
  if (!product) return [];

  const sameCollection = collectionsForProduct(product).flatMap(collectionProducts);
  const sharedTag = products.filter((candidate) =>
    candidate.tags.some((tag) => product.tags.includes(tag)),
  );

  const seen = new Set<string>([product.id]);
  const picks: Product[] = [];
  for (const candidate of [...sameCollection, ...sharedTag, ...products]) {
    if (seen.has(candidate.id) || !visible(candidate)) continue;
    seen.add(candidate.id);
    picks.push(candidate);
    if (picks.length === 4) break;
  }
  return picks;
}
