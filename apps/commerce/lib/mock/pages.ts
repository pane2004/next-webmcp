import type { Page } from "../shopify/types";

/**
 * Static content pages for mock mode, rendered by `app/[page]/page.tsx`.
 * Handles match the footer menu in `./menus.ts`.
 *
 * @example
 * (await getPage("about")).title; // "About"
 * @see ../shopify/storefront.ts#getPage
 */

type PageSpec = Pick<Page, "handle" | "title" | "body" | "bodySummary">;

const CREATED_AT = "2024-01-01T00:00:00Z";
const UPDATED_AT = "2024-06-01T00:00:00Z";

const SPECS: PageSpec[] = [
  {
    handle: "about",
    title: "About",
    bodySummary:
      "A demo storefront showing how Next.js apps expose WebMCP tools to browser agents.",
    body: `<p>This store is a demo of <strong>next-webmcp</strong>: a small library that lets a Next.js app register <em>WebMCP</em> tools with the browser's <code>document.modelContext</code>, so an AI agent running in Chrome can search the catalog, pick variants, manage the cart and start checkout by calling typed tools instead of scraping the page.</p>
<p>The catalog is an in-memory mock of Vercel's Acme demo store. No Shopify account is needed: set <code>SHOPIFY_STORE_DOMAIN</code> and <code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> to switch to a real store with the same UI.</p>
<p>Nothing here is for sale, and checkout collects no personal data.</p>`,
  },
  {
    handle: "learn",
    title: "Learn",
    bodySummary: "How WebMCP tools work in this store.",
    body: `<p>Open the browser's agent panel (Chrome with WebMCP enabled) and ask it to find a product, add it to the cart or start checkout. Each page registers a small set of tools scoped to what that page can do; the devtools panel in the corner lists them and logs every call.</p>
<p>Read the source in <code>apps/commerce/app/tools.ts</code> to see how tools are declared with Zod schemas and executed against the same server actions the UI uses.</p>`,
  },
  {
    handle: "terms-conditions",
    title: "Terms & Conditions",
    bodySummary: "Terms for using this demo store.",
    body: `<p>This is a demonstration site. Products, prices and orders are simulated and no goods will be shipped. Use of the site is at your own discretion and the software is provided "as is" without warranty of any kind.</p>`,
  },
  {
    handle: "shipping-return-policy",
    title: "Shipping & Return Policy",
    bodySummary: "Shipping and returns for this demo store.",
    body: `<p>Because this is a demo, nothing ships and nothing can be returned. In a real deployment this page would describe carriers, delivery windows and the return process.</p>`,
  },
  {
    handle: "privacy-policy",
    title: "Privacy Policy",
    bodySummary: "How this demo store handles data.",
    body: `<p>The store keeps your cart in a cookie on your own browser and collects no personal information. Checkout asks for no name, address or payment details. No analytics or tracking scripts are loaded by the demo itself.</p>`,
  },
  {
    handle: "frequently-asked-questions",
    title: "FAQ",
    bodySummary: "Common questions about the demo.",
    body: `<h2>Is this a real shop?</h2>
<p>No. The catalog is mock data and orders are simulated.</p>
<h2>Do I need Shopify credentials?</h2>
<p>No. Without credentials the app runs against the in-memory catalog. With them, the same UI talks to your Shopify store.</p>
<h2>Which browsers support WebMCP?</h2>
<p>Chrome builds with the WebMCP flag enabled expose <code>document.modelContext</code>. Everywhere else the store works as a normal website.</p>`,
  },
];

const pages: Page[] = SPECS.map((spec) => ({
  id: `page-${spec.handle}`,
  ...spec,
  seo: { title: spec.title, description: spec.bodySummary },
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
}));

/**
 * Like Shopify, an unknown handle resolves to a nullish value at runtime so
 * `app/[page]/page.tsx` can call `notFound()`; the declared return type is
 * kept identical to the Storefront implementation.
 */
export async function getPage(handle: string): Promise<Page> {
  return pages.find((page) => page.handle === handle) as Page;
}

export async function getPages(): Promise<Page[]> {
  return pages;
}
