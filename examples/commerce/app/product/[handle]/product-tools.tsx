"use client";

import { ModelContext } from "next-webmcp";
import type { Product } from "lib/shopify/types";
import { useMemo } from "react";
import { createProductTools } from "./tools";

/**
 * Registers `get_product` and `add_to_cart` for the product being viewed.
 * Renders nothing visible; unmounting (navigating away) unregisters the tools.
 *
 * @example
 * <ProductTools product={product} />
 * @see app/product/[handle]/tools.ts
 */
export function ProductTools({ product }: { product: Product }) {
  const tools = useMemo(() => createProductTools(product), [product]);
  return <ModelContext tools={tools} />;
}
