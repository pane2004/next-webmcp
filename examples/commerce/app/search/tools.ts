import { z } from "zod";
import { defineTools, tool, type ToolDef } from "next-web-mcp";
import { sorting } from "lib/constants";
import type { Collection } from "lib/shopify/types";
import { createUrl } from "lib/utils";

const SORT_SLUGS = [
  "relevance",
  "trending-desc",
  "latest-desc",
  "price-asc",
  "price-desc",
] as const;

function sortTitle(slug: string | undefined): string {
  const match = sorting.find((item) => (item.slug ?? "relevance") === (slug ?? "relevance"));
  return match?.title ?? "Relevance";
}

function findCollection(collections: Collection[], name: string): Collection | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle || needle === "all" || needle === "all products") {
    return collections.find((collection) => collection.handle === "");
  }
  return collections.find(
    (collection) =>
      collection.handle.toLowerCase() === needle || collection.title.toLowerCase() === needle,
  );
}

/**
 * Builds the search-page tool. Register it only under `/search` so it appears
 * and disappears as the shopper moves between routes.
 *
 * @example
 * const tools = useMemo(() => createSearchTools(collections), [collections]);
 * <ModelContext tools={tools} />
 * @see app/search/search-tools.tsx
 */
export function createSearchTools(collections: Collection[]): ToolDef[] {
  const collectionNames = collections.map((collection) => collection.title).join(", ");

  return defineTools({
    refine_results: tool({
      description:
        "Change how the search results are shown: sort them (relevance, trending-desc, latest-desc, price-asc, price-desc) and/or switch to a collection by handle or title. Keeps the current search keyword when staying on the same page.",
      input: z.object({
        sort: z
          .enum(SORT_SLUGS)
          .optional()
          .describe("Sort order. price-asc is cheapest first; price-desc is most expensive first."),
        collection: z
          .string()
          .min(1)
          .optional()
          .describe(`Collection handle or title. Available: ${collectionNames || "All"}.`),
      }),
      execute: (ctx) => async (input) => {
        if (!input.sort && !input.collection) {
          return `Provide a sort, a collection, or both. Sorts: ${SORT_SLUGS.join(", ")}. Collections: ${collectionNames || "All"}.`;
        }

        let target: Collection | undefined;
        if (input.collection) {
          target = findCollection(collections, input.collection);
          if (!target) {
            return `No collection named "${input.collection}". Available: ${collectionNames || "All"}.`;
          }
        }

        const path =
          target?.path ?? (ctx.pathname.startsWith("/search") ? ctx.pathname : "/search");
        const params = new URLSearchParams();
        const keyword = ctx.searchParams.get("q");
        if (keyword && path === ctx.pathname) params.set("q", keyword);

        const sort = input.sort ?? ctx.searchParams.get("sort") ?? undefined;
        if (sort && sort !== "relevance") params.set("sort", sort);

        const shownCollection =
          target?.title ??
          collections.find((collection) => collection.path === path)?.title ??
          "all products";

        // Return before navigating so the agent receives this string.
        const url = createUrl(path, params);
        setTimeout(() => ctx.router.push(url), 0);
        return `Showing ${shownCollection} sorted by ${sortTitle(sort)}.`;
      },
    }),
  });
}
