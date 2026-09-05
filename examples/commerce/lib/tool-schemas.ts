import { z } from "zod";

/*
 * Zod schemas shared by a tool (`app/tools.ts`) and the server action behind it
 * (`app/actions.ts`). They live in their own module because a `"use server"` file
 * may only export async functions, and `tools.ts` importing `actions.ts` importing
 * `tools.ts` would be a cycle.
 */

/**
 * Input of the `search_products` tool and of the `searchProducts` server action.
 * `<ModelContext>` parses it in the browser before the call; `toolAction` parses it
 * again on the server, so the action never trusts what the browser sends.
 *
 * @example
 * searchProductsInput.parse({ query: "shirt" }); // { query: "shirt", limit: 8 }
 * @see app/actions.ts searchProducts
 */
export const searchProductsInput = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .describe('Keyword to search for, such as "shirt", "hat" or "mug".'),
  maxPrice: z
    .number()
    .positive()
    .optional()
    .describe("Only include products whose lowest price is at most this amount."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8)
    .describe("Maximum number of products to return (1–20)."),
});

/** What callers pass to `searchProducts` (`limit` is optional; the schema fills in 8). */
export type SearchProductsInput = z.input<typeof searchProductsInput>;

/**
 * Input of the newsletter subscription. The declarative `subscribe_newsletter` form posts
 * `email` as `FormData`, and the manifest describes that form with this same schema.
 *
 * @example
 * newsletterInput.safeParse({ email: "not-an-email" }).success; // false
 * @see app/actions.ts subscribeToNewsletter
 */
export const newsletterInput = z.object({
  email: z.string().email().describe("Email address to subscribe"),
});
