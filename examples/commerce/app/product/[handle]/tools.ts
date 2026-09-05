import { z } from "zod";
import { defineTools, tool, type ToolDef } from "next-web-mcp";
import { addItem, updateItemQuantity } from "components/cart/actions";
import { DEFAULT_OPTION } from "lib/constants";
import type { Product, ProductOption, ProductVariant } from "lib/shopify/types";
import { formatAmount, runCartTransition, type CartApi } from "lib/cart-tools-helpers";

/** Options that carry real choices (Shopify's placeholder "Title" option is skipped). */
function realOptions(product: Product): ProductOption[] {
  return product.options.filter(
    (option) =>
      !(option.values.length === 1 && option.values[0] === DEFAULT_OPTION) &&
      option.name !== "Title",
  );
}

function selectedFromSearchParams(
  product: Product,
  searchParams: URLSearchParams,
): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const option of realOptions(product)) {
    const value = searchParams.get(option.name.toLowerCase());
    if (value) selected[option.name] = value;
  }
  return selected;
}

function variantOptions(variant: ProductVariant): Record<string, string> {
  const map: Record<string, string> = {};
  for (const option of variant.selectedOptions) {
    if (option.value !== DEFAULT_OPTION) map[option.name] = option.value;
  }
  return map;
}

function describeOptions(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([name, value]) => `${name} ${value}`)
    .join(", ");
}

function availableVariantTitles(product: Product): string {
  const titles = product.variants
    .filter((variant) => variant.availableForSale)
    .map((variant) => variant.title);
  return titles.length ? titles.join(", ") : "none right now";
}

type VariantResolution =
  | { kind: "ok"; variant: ProductVariant; options: Record<string, string> }
  | { kind: "error"; message: string };

/**
 * Resolves a variant from natural-language options (case-insensitive names and
 * values), falling back to the URL selection and then to a single variant.
 * Every failure returns a message that tells the agent exactly what to send next.
 */
export function resolveVariant(
  product: Product,
  requested: Record<string, string> | undefined,
  searchParams: URLSearchParams,
): VariantResolution {
  const options = realOptions(product);
  const urlSelection = selectedFromSearchParams(product, searchParams);
  const chosen: Record<string, string> = {};

  for (const [rawName, rawValue] of Object.entries(requested ?? {})) {
    const option = options.find(
      (candidate) => candidate.name.toLowerCase() === rawName.trim().toLowerCase(),
    );
    if (!option) {
      const names = options.map((candidate) => candidate.name).join(", ");
      return {
        kind: "error",
        message: names
          ? `Unknown option "${rawName}". This product has: ${names}.`
          : `This product has no options; call add_to_cart without options.`,
      };
    }
    const value = option.values.find(
      (candidate) => candidate.toLowerCase() === String(rawValue).trim().toLowerCase(),
    );
    if (!value) {
      return {
        kind: "error",
        message: `Unknown value "${rawValue}" for ${option.name}. Available: ${option.values.join(", ")}.`,
      };
    }
    chosen[option.name] = value;
  }

  for (const option of options) {
    if (chosen[option.name]) continue;
    const fromUrl = urlSelection[option.name];
    const canonical = fromUrl
      ? option.values.find((v) => v.toLowerCase() === fromUrl.toLowerCase())
      : undefined;
    if (canonical) {
      chosen[option.name] = canonical;
    } else if (product.variants.length === 1) {
      break;
    } else {
      return {
        kind: "error",
        message: `Choose a ${option.name}. Available: ${option.values.join(", ")}.`,
      };
    }
  }

  const variant =
    product.variants.length === 1 && options.length === 0
      ? product.variants[0]
      : product.variants.find((candidate) =>
          options.every((option) => {
            const selected = candidate.selectedOptions.find((entry) => entry.name === option.name);
            return selected?.value === chosen[option.name];
          }),
        );

  if (!variant) {
    return {
      kind: "error",
      message: `No variant with ${describeOptions(chosen)} exists. Available combinations: ${availableVariantTitles(product)}.`,
    };
  }
  if (!variant.availableForSale) {
    const label = options.length ? `${product.title} (${describeOptions(chosen)})` : product.title;
    return {
      kind: "error",
      message: `${label} is out of stock. Available: ${availableVariantTitles(product)}.`,
    };
  }
  return { kind: "ok", variant, options: variantOptions(variant) };
}

/**
 * Builds the tools that only make sense on a product page. Register them with
 * `<ModelContext>` from a client component so they swap in and out with the route.
 * `add_to_cart` closes over `cartApi`, so rebuild the tools whenever `useCart()`
 * returns a new value; the tool identity stays the same, so nothing re-registers.
 *
 * @example
 * const cartApi = useCart();
 * const tools = useMemo(() => createProductTools(product, cartApi), [product, cartApi]);
 * <ModelContext tools={tools} />
 * @see app/product/[handle]/product-tools.tsx
 * @see lib/mock/cart-api-stub.ts for the manifest route, which has no React tree
 */
export function createProductTools(product: Product, cartApi: CartApi): ToolDef[] {
  return defineTools({
    get_product: tool({
      description:
        "Read the product on the current page: title, description, price range, options with their values, every variant with price and stock, and which options are currently selected. Call it before add_to_cart when you need to pick a Color or Size.",
      input: z.object({}),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (ctx) => async () => {
        const selectedOptions = selectedFromSearchParams(product, ctx.searchParams);
        const selectedVariant = product.variants.find((variant) =>
          variant.selectedOptions.every(
            (option) =>
              option.value === DEFAULT_OPTION || option.value === selectedOptions[option.name],
          ),
        );
        return JSON.stringify({
          title: product.title,
          handle: product.handle,
          path: `/product/${product.handle}`,
          description: product.description,
          price: {
            min: formatAmount(product.priceRange.minVariantPrice.amount),
            max: formatAmount(product.priceRange.maxVariantPrice.amount),
            currency: product.priceRange.minVariantPrice.currencyCode,
          },
          availableForSale: product.availableForSale,
          options: realOptions(product).map((option) => ({
            name: option.name,
            values: option.values,
          })),
          variants: product.variants.map((variant) => ({
            title: variant.title,
            options: variantOptions(variant),
            price: formatAmount(variant.price.amount),
            available: variant.availableForSale,
          })),
          selectedOptions,
          selectedVariant: selectedVariant?.title ?? null,
        });
      },
    }),

    add_to_cart: tool({
      description:
        'Add this page\'s product to the cart. Pass the options to choose (for example { "Color": "Blue", "Size": "9" }; names and values are matched case-insensitively) or omit them to use the selection shown on the page. Returns the new cart count.',
      input: z.object({
        options: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Option name to value, e.g. { "Color": "Blue", "Size": "9" }. Omit to use the options selected on the page.',
          ),
        quantity: z.number().int().min(1).default(1).describe("How many to add (default 1)."),
      }),
      execute: (ctx) => async (input) => {
        const resolved = resolveVariant(product, input.options, ctx.searchParams);
        if (resolved.kind === "error") return resolved.message;

        const { variant, options } = resolved;
        const { cart, addCartItem } = cartApi;
        const existing =
          cart?.lines.find((line) => line.merchandise.id === variant.id)?.quantity ?? 0;

        let failure: string | undefined;
        await runCartTransition(async () => {
          for (let i = 0; i < input.quantity; i++) {
            addCartItem(variant, product);
          }
          failure =
            input.quantity === 1
              ? await addItem(null, variant.id)
              : await updateItemQuantity(null, {
                  merchandiseId: variant.id,
                  quantity: existing + input.quantity,
                });
        });
        if (failure) {
          return `Could not add ${product.title}: ${failure}. Call get_cart to check the cart and try again.`;
        }

        // Reflect the chosen options in the URL so the variant selector highlights them.
        const params = new URLSearchParams(ctx.searchParams.toString());
        for (const [name, value] of Object.entries(options)) {
          params.set(name.toLowerCase(), value);
        }
        const query = params.toString();
        setTimeout(() => {
          ctx.router.replace(query ? `${ctx.pathname}?${query}` : ctx.pathname, {
            scroll: false,
          });
        }, 0);

        const total = (cart?.totalQuantity ?? 0) + input.quantity;
        const label = Object.keys(options).length
          ? `${product.title} (${describeOptions(options)})`
          : product.title;
        return `Added ${input.quantity} × ${label} to the cart. Cart now has ${total} items.`;
      },
    }),
  });
}
