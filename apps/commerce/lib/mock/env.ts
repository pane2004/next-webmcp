/**
 * Fills in display-only environment variables so the template's layout,
 * navbar and footer render without a `.env` file.
 *
 * `app/layout.tsx`, `components/layout/navbar` and `components/layout/footer`
 * read `process.env.SITE_NAME` / `process.env.COMPANY_NAME` at module scope.
 * They all import `lib/shopify` first, and `lib/shopify/index.ts` imports this
 * module before anything else, so ES module evaluation order guarantees the
 * defaults are in place before those reads happen. Values set in the real
 * environment always win.
 *
 * Server-only: never import this from a client component.
 *
 * @example
 * // lib/shopify/index.ts
 * import "lib/mock/env";
 * @see ./mode.ts
 */
export const DEFAULT_SITE_NAME = "Next.js Commerce × WebMCP";
export const DEFAULT_COMPANY_NAME = "Acme Store";

if (!process.env.SITE_NAME) {
  process.env.SITE_NAME = DEFAULT_SITE_NAME;
}

if (!process.env.COMPANY_NAME) {
  process.env.COMPANY_NAME = DEFAULT_COMPANY_NAME;
}
