import type { Image, Money, Product, ProductOption, ProductVariant } from "../shopify/types";

/**
 * In-memory product catalog mirroring Vercel's "Acme" demo store.
 *
 * Images are served from Shopify's public CDN (allowed by `next.config.ts`).
 * Prices, option sets and availability are curated for the WebMCP demo, so
 * e.g. "blue slip-on shoes, size 9, under $80" resolves to a real variant.
 *
 * This module is pure data: no Next.js or Node imports, so it can be loaded
 * by plain node scripts and tests.
 *
 * @example
 * import { products, findVariant } from "lib/mock/catalog";
 * const shoes = products.find((p) => p.handle === "acme-slip-on-shoes");
 * findVariant("variant-acme-slip-on-shoes-blue-9")?.variant.price; // { amount: "65.00", currencyCode: "USD" }
 * @see ./products.ts for search and sorting helpers.
 */

const CDN = "https://cdn.shopify.com/s/files/1/0754/3727/7491";
const CURRENCY = "USD";
const IMAGE_SIZE = 1000;

/** Standard apparel sizes used by every clothing item. */
const APPAREL_SIZES = ["XS", "S", "M", "L", "XL"];

type SelectedOptions = Record<string, string>;

type ProductSpec = {
  handle: string;
  title: string;
  description: string;
  /** Flat price, or a function of the selected option values. */
  price: number | ((selected: SelectedOptions) => number);
  /** Omit for single-variant products ("Default Title"). */
  options?: Array<{ name: string; values: string[] }>;
  /** Variant titles (e.g. "Black / M") that are out of stock. */
  unavailable?: string[];
  /** CDN paths relative to the store root, e.g. "files/shoes-1.png". */
  images: string[];
  tags: string[];
  updatedAt: string;
};

const SPECS: ProductSpec[] = [
  {
    handle: "acme-t-shirt",
    title: "Acme T-Shirt",
    description: "60% combed ringspun cotton/40% polyester jersey tee.",
    price: ({ Size }) => (Size === "XL" ? 20 : 18),
    options: [
      { name: "Color", values: ["Black", "Blue", "Gray", "Pink", "White"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
    unavailable: ["Pink / XS"],
    images: [
      "files/t-shirt-color-black.png",
      "files/t-shirt-color-blue.png",
      "files/t-shirt-color-gray.png",
      "files/t-shirt-color-pink.png",
      "files/t-shirt-color-white.png",
    ],
    tags: ["Apparel", "T-Shirts"],
    updatedAt: "2024-01-08T10:00:00Z",
  },
  {
    handle: "acme-geometric-circles-t-shirt",
    title: "Acme Circles T-Shirt",
    description:
      "60% combed ringspun cotton/40% polyester jersey tee with a geometric circles print.",
    price: ({ Size }) => (Size === "XL" ? 20 : 18),
    options: [
      { name: "Color", values: ["Black", "White", "Blue"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
    unavailable: ["Black / M"],
    images: ["files/t-shirt-circles-blue.png", "files/t-shirt-1.png", "files/t-shirt-2.png"],
    tags: ["Apparel", "T-Shirts"],
    updatedAt: "2024-02-14T10:00:00Z",
  },
  {
    handle: "acme-rainbow-prism-t-shirt",
    title: "Acme Prism T-Shirt",
    description: "60% combed ringspun cotton/40% polyester jersey tee with a rainbow prism print.",
    price: ({ Size }) => (Size === "XL" ? 25 : 22),
    options: [{ name: "Size", values: APPAREL_SIZES }],
    images: [
      "files/t-shirt-spiral-1.png",
      "files/t-shirt-spiral-2.png",
      "files/t-shirt-spiral-3.png",
      "files/t-shirt-spiral-4.png",
    ],
    tags: ["Apparel", "T-Shirts"],
    updatedAt: "2024-03-02T10:00:00Z",
  },
  {
    handle: "acme-hoodie",
    title: "Acme Hoodie",
    description: "Fabric blend of Supima Cotton and Micromodal.",
    price: 48,
    options: [{ name: "Size", values: APPAREL_SIZES }],
    images: ["files/hoodie-1.png", "files/hoodie-2.png"],
    tags: ["Apparel", "Hoodies"],
    updatedAt: "2024-03-20T10:00:00Z",
  },
  {
    handle: "acme-bomber-jacket",
    title: "Acme Bomber Jacket",
    description:
      "The multi-season must-have jacket: light and classic for daily wear, with a soft fleece lining for extra warmth.",
    price: ({ Color }) => (Color === "Black" ? 110 : 95),
    options: [
      { name: "Color", values: ["Army", "Black"] },
      { name: "Size", values: APPAREL_SIZES },
    ],
    images: ["files/bomber-jacket-army.png", "files/bomber-jacket-black.png"],
    tags: ["Apparel", "Jackets"],
    updatedAt: "2024-04-11T10:00:00Z",
  },
  {
    handle: "acme-slip-on-shoes",
    title: "Acme Slip-On Shoes",
    description:
      "Step into summer! Sleek, easy, and effortlessly stylish. The low-profile slip-on canvas upper offers unbeatable convenience, with supportive padded collars, elastic side accents and signature rubber waffle outsoles.",
    price: 65,
    options: [
      { name: "Color", values: ["Blue", "Black", "White"] },
      { name: "Size", values: ["7", "8", "9", "10", "11", "12"] },
    ],
    unavailable: ["White / 12"],
    images: ["files/shoes-1.png", "files/shoes-2.png", "files/shoes-3.png", "files/shoes-4.png"],
    tags: ["Apparel", "Shoes", "Footwear"],
    updatedAt: "2024-05-05T10:00:00Z",
  },
  {
    handle: "acme-dog-sweater",
    title: "Acme Dog Sweater",
    description:
      "Keep your dog warm all winter long. Soft and stretchy fleece made with 90% polyester and 5% polyurethane to keep moisture out and warm air in. Safe, durable, and made to last.",
    price: 24,
    options: [
      {
        name: "Size",
        values: ["0 - 5 lbs", "5 - 20 lbs", "20 - 50 lbs", "50 - 75 lbs", "75+ lbs"],
      },
    ],
    images: ["files/dog-sweater-1.png", "files/dog-sweater-2.png"],
    tags: ["Apparel", "Pets"],
    updatedAt: "2024-01-22T10:00:00Z",
  },
  {
    handle: "acme-cap",
    title: "Acme Cap",
    description: "100% peach-washed cotton.",
    price: 22,
    images: ["files/hat-1.png", "files/hat-2.png", "files/hat-3.png"],
    tags: ["Accessories", "Hats"],
    updatedAt: "2024-02-01T10:00:00Z",
  },
  {
    handle: "acme-cowboy-hat",
    title: "Acme Cowboy Hat",
    description:
      'Part of our Buffalo collection, this cowboy hat is made in the USA of high-quality, weather-resistant 4X buffalo felt. Classic cattleman crease, 4" brim, leather sweatband, satin lining and a self-matching hat band with a three-piece silver-toned buckle set. Ships in a hat box.',
    price: 160,
    options: [
      { name: "Color", values: ["Black", "Tan"] },
      { name: "Size", values: ["7", "7 1/8", "7 1/4", "7 3/8", "7 1/2"] },
    ],
    images: [
      "files/cowboy-hat-black-1.png",
      "files/cowboy-hat-black-2.png",
      "files/cowboy-hat-tan-1.png",
      "files/cowboy-hat-tan-2.png",
      "files/cowboy-hat-black-3.png",
    ],
    tags: ["Accessories", "Hats"],
    updatedAt: "2024-06-18T10:00:00Z",
  },
  {
    handle: "acme-drawstring-bag",
    title: "Acme Drawstring Bag",
    description:
      "Strong 210D ripstop nylon drawstring bag. Available in multiple sizes with an easy-to-close durable drawstring. Sturdy, reusable, and resilient.",
    price: ({ Size }) => (Size === "12 x 16 inch" ? 12 : Size === "9 x 12 inch" ? 9 : 6),
    options: [
      { name: "Color", values: ["Black", "White"] },
      { name: "Size", values: ["6 x 8 inch", "9 x 12 inch", "12 x 16 inch"] },
    ],
    unavailable: ["Black / 6 x 8 inch"],
    images: ["files/bag-1-dark.png", "files/bag-1-light.png"],
    tags: ["Accessories", "Bags"],
    updatedAt: "2024-04-28T10:00:00Z",
  },
  {
    handle: "acme-sticker",
    title: "Acme Sticker",
    description: "Die-cut vinyl Acme logo sticker. Weatherproof and dishwasher safe.",
    price: 4,
    images: ["files/sticker.png", "files/sticker-rainbow.png"],
    tags: ["Accessories", "Stickers"],
    updatedAt: "2023-12-12T10:00:00Z",
  },
  {
    handle: "acme-rainbow-sticker",
    title: "Acme Rainbow Sticker",
    description:
      "Die-cut vinyl Acme logo sticker in a rainbow gradient. Weatherproof and dishwasher safe.",
    price: 4,
    images: ["files/sticker-rainbow.png", "files/sticker.png"],
    tags: ["Accessories", "Stickers"],
    updatedAt: "2023-12-15T10:00:00Z",
  },
  {
    handle: "acme-baby-cap",
    title: "Acme Baby Cap",
    description: "100% combed ringspun cotton.",
    price: 12,
    options: [{ name: "Color", values: ["Black", "Gray", "White"] }],
    images: ["files/baby-cap-black.png", "files/baby-cap-gray.png", "files/baby-cap-white.png"],
    tags: ["Kids", "Hats"],
    updatedAt: "2024-02-20T10:00:00Z",
  },
  {
    handle: "acme-baby-onesie",
    title: "Acme Baby Onesie",
    description: "Short sleeve 5-oz, 100% combed ringspun cotton onesie.",
    price: 14,
    options: [
      { name: "Size", values: ["NB", "3M", "6M", "12M", "18M", "24M"] },
      { name: "Color", values: ["Black", "White", "Beige"] },
    ],
    images: [
      "files/baby-onesie-beige-1.png",
      "files/baby-onesie-black-1.png",
      "files/baby-onesie-white-1.png",
      "files/baby-onesie-beige-2.png",
      "files/baby-onesie-black-2.png",
    ],
    tags: ["Kids", "Apparel"],
    updatedAt: "2024-03-12T10:00:00Z",
  },
  {
    handle: "acme-pacifier",
    title: "Acme Pacifier",
    description:
      "Thoughtfully designed for your baby's comfort. Lets your child self-soothe in the most natural way possible.",
    price: 10,
    images: ["files/pacifier-1.png", "files/pacifier-2.png"],
    tags: ["Kids"],
    updatedAt: "2024-01-30T10:00:00Z",
  },
  {
    handle: "acme-mug",
    title: "Acme Mug",
    description: "12 oz Beck Cork-Bottom Mug.",
    price: 15,
    images: ["files/mug-1.png", "files/mug-2.png"],
    tags: ["Home & Office", "Drinkware"],
    updatedAt: "2024-02-08T10:00:00Z",
  },
  {
    handle: "acme-cup",
    title: "Acme Cup",
    description: "12oz double wall ceramic body with a padded bottom.",
    price: 16,
    options: [{ name: "Color", values: ["Black", "White"] }],
    images: ["files/cup-black.png", "files/cup-white.png"],
    tags: ["Home & Office", "Drinkware"],
    updatedAt: "2024-03-26T10:00:00Z",
  },
  {
    handle: "acme-mechanical-keyboard",
    title: "Acme Keyboard",
    description:
      "Compact 75% mechanical keyboard with hot-swappable switches, PBT keycaps and USB-C. Works with macOS, Windows and Linux.",
    price: 150,
    images: ["files/keyboard.png"],
    tags: ["Home & Office", "Electronics"],
    updatedAt: "2024-05-30T10:00:00Z",
  },
];

/** Slugifies an option value for use inside an id ("7 1/8" → "7-1-8"). */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function money(amount: number): Money {
  return { amount: amount.toFixed(2), currencyCode: CURRENCY };
}

function toImage(path: string, productTitle: string): Image {
  const filename = path.match(/.*\/(.*)\..*/)?.[1] ?? path;
  return {
    url: `${CDN}/${path}`,
    altText: `${productTitle} - ${filename}`,
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  };
}

/** Cartesian product of option values, in option order (matches Shopify). */
function combinations(
  options: Array<{ name: string; values: string[] }>,
): Array<Array<{ name: string; value: string }>> {
  return options.reduce<Array<Array<{ name: string; value: string }>>>(
    (acc, option) =>
      acc.flatMap((prefix) =>
        option.values.map((value) => [...prefix, { name: option.name, value }]),
      ),
    [[]],
  );
}

function buildProduct(spec: ProductSpec): Product {
  const optionSpecs = spec.options ?? [{ name: "Title", values: ["Default Title"] }];
  const options: ProductOption[] = optionSpecs.map((option) => ({
    id: `option-${spec.handle}-${slug(option.name)}`,
    name: option.name,
    values: option.values,
  }));

  const variants: ProductVariant[] = combinations(optionSpecs).map((selectedOptions) => {
    const selected: SelectedOptions = Object.fromEntries(
      selectedOptions.map((o) => [o.name, o.value]),
    );
    const title = selectedOptions.map((o) => o.value).join(" / ");
    const idSuffix = spec.options ? selectedOptions.map((o) => slug(o.value)).join("-") : "default";
    const price = typeof spec.price === "function" ? spec.price(selected) : spec.price;

    return {
      id: `variant-${spec.handle}-${idSuffix}`,
      title,
      availableForSale: !(spec.unavailable ?? []).includes(title),
      selectedOptions,
      price: money(price),
    };
  });

  const amounts = variants.map((v) => Number(v.price.amount));
  const images = spec.images.map((path) => toImage(path, spec.title));
  const featuredImage = images[0];

  if (!featuredImage) {
    throw new Error(`Mock product "${spec.handle}" needs at least one image.`);
  }

  return {
    id: `product-${spec.handle}`,
    handle: spec.handle,
    availableForSale: variants.some((v) => v.availableForSale),
    title: spec.title,
    description: spec.description,
    descriptionHtml: `<p>${spec.description}</p>`,
    options,
    priceRange: {
      minVariantPrice: money(Math.min(...amounts)),
      maxVariantPrice: money(Math.max(...amounts)),
    },
    variants,
    featuredImage,
    images,
    seo: { title: spec.title, description: spec.description },
    tags: spec.tags,
    updatedAt: spec.updatedAt,
  };
}

/** Every mock product, in catalog (default "relevance") order. */
export const products: Product[] = SPECS.map(buildProduct);

const byHandle = new Map(products.map((p) => [p.handle, p]));
const byId = new Map(products.map((p) => [p.id, p]));
const byVariantId = new Map(
  products.flatMap((product) =>
    product.variants.map((variant) => [variant.id, { product, variant }]),
  ),
);

/**
 * Looks up a product by its URL handle.
 *
 * @example
 * getProductByHandle("acme-mug")?.title; // "Acme Mug"
 */
export function getProductByHandle(handle: string): Product | undefined {
  return byHandle.get(handle);
}

/**
 * Looks up a product by its id (`product-<handle>`).
 *
 * @example
 * getProductById("product-acme-mug")?.handle; // "acme-mug"
 */
export function getProductById(id: string): Product | undefined {
  return byId.get(id);
}

/**
 * Resolves a variant id (`variant-<handle>-<option slugs>`) to its variant
 * and parent product. Used by the mock cart to hydrate cookie lines.
 *
 * @example
 * findVariant("variant-acme-slip-on-shoes-blue-9")?.variant.title; // "Blue / 9"
 */
export function findVariant(
  variantId: string,
): { product: Product; variant: ProductVariant } | undefined {
  return byVariantId.get(variantId);
}
