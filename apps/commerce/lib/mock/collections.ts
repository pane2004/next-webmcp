import type { Collection } from "../shopify/types";
import { getProductByHandle, products } from "./catalog";
import type { Product } from "../shopify/types";

/**
 * Mock collections. Handles starting with `hidden-` power the homepage
 * (featured grid and carousel) and are excluded from `getCollections()`,
 * matching the Shopify implementation.
 *
 * @example
 * import { getCollectionByHandle, collectionProducts } from "lib/mock/collections";
 * collectionProducts("apparel").length; // 7
 * @see ../shopify/storefront.ts for the behaviour being mirrored.
 */

type CollectionSpec = Omit<Collection, "path"> & {
  /** Product handles, in display order. */
  products: string[];
};

const SPECS: CollectionSpec[] = [
  {
    handle: "hidden-homepage-featured-items",
    title: "Homepage featured items",
    description: "Products shown in the homepage hero grid.",
    seo: { title: "Homepage featured items", description: "" },
    updatedAt: "2024-06-01T10:00:00Z",
    products: ["acme-geometric-circles-t-shirt", "acme-drawstring-bag", "acme-cup"],
  },
  {
    handle: "hidden-homepage-carousel",
    title: "Homepage carousel",
    description: "Products shown in the homepage carousel.",
    seo: { title: "Homepage carousel", description: "" },
    updatedAt: "2024-06-01T10:00:00Z",
    products: [
      "acme-slip-on-shoes",
      "acme-hoodie",
      "acme-bomber-jacket",
      "acme-cowboy-hat",
      "acme-mechanical-keyboard",
      "acme-baby-onesie",
    ],
  },
  {
    handle: "apparel",
    title: "Apparel",
    description: "T-shirts, hoodies, jackets and shoes.",
    seo: { title: "Apparel", description: "T-shirts, hoodies, jackets and shoes." },
    updatedAt: "2024-05-05T10:00:00Z",
    products: [
      "acme-t-shirt",
      "acme-geometric-circles-t-shirt",
      "acme-rainbow-prism-t-shirt",
      "acme-hoodie",
      "acme-bomber-jacket",
      "acme-slip-on-shoes",
      "acme-dog-sweater",
    ],
  },
  {
    handle: "accessories",
    title: "Accessories",
    description: "Hats, bags and stickers.",
    seo: { title: "Accessories", description: "Hats, bags and stickers." },
    updatedAt: "2024-06-18T10:00:00Z",
    products: [
      "acme-cap",
      "acme-cowboy-hat",
      "acme-drawstring-bag",
      "acme-sticker",
      "acme-rainbow-sticker",
    ],
  },
  {
    handle: "kids",
    title: "Kids",
    description: "Everything for the smallest Acme fans.",
    seo: { title: "Kids", description: "Everything for the smallest Acme fans." },
    updatedAt: "2024-03-12T10:00:00Z",
    products: ["acme-baby-cap", "acme-baby-onesie", "acme-pacifier"],
  },
  {
    handle: "home-and-office",
    title: "Home & Office",
    description: "Mugs, cups and desk gear.",
    seo: { title: "Home & Office", description: "Mugs, cups and desk gear." },
    updatedAt: "2024-05-30T10:00:00Z",
    products: ["acme-mug", "acme-cup", "acme-mechanical-keyboard"],
  },
];

/** All mock collections (including hidden ones) with their `/search/<handle>` path. */
export const collections: Collection[] = SPECS.map(({ products: _products, ...collection }) => ({
  ...collection,
  path: `/search/${collection.handle}`,
}));

const membership = new Map(SPECS.map((spec) => [spec.handle, spec.products]));

/**
 * Looks up a collection (hidden ones included) by handle.
 *
 * @example
 * getCollectionByHandle("apparel")?.path; // "/search/apparel"
 */
export function getCollectionByHandle(handle: string): Collection | undefined {
  return collections.find((collection) => collection.handle === handle);
}

/**
 * Products in a collection, in the collection's display order.
 * Returns an empty array for unknown handles.
 *
 * @example
 * collectionProducts("kids").map((p) => p.handle); // ["acme-baby-cap", ...]
 */
export function collectionProducts(handle: string): Product[] {
  const handles = membership.get(handle) ?? [];
  return handles
    .map(getProductByHandle)
    .filter((product): product is Product => product !== undefined);
}

/**
 * Handles of the visible (non-hidden) collections a product belongs to.
 *
 * @example
 * collectionsForProduct(products[0]!); // ["apparel"]
 */
export function collectionsForProduct(product: Product): string[] {
  return SPECS.filter(
    (spec) => !spec.handle.startsWith("hidden") && spec.products.includes(product.handle),
  ).map((spec) => spec.handle);
}

/** Re-exported so callers that need the full catalog do not import two modules. */
export { products };
