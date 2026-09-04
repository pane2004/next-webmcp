"use client";

import { ModelContext } from "next-webmcp";
import type { Collection } from "lib/shopify/types";
import { useMemo } from "react";
import { createSearchTools } from "./tools";

/**
 * Registers `refine_results` while a search page is open.
 *
 * @example
 * <SearchTools collections={await getCollections()} />
 * @see app/search/tools.ts
 */
export function SearchTools({ collections }: { collections: Collection[] }) {
  const tools = useMemo(() => createSearchTools(collections), [collections]);
  return <ModelContext tools={tools} />;
}
