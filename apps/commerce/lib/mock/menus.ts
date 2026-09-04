import type { Menu } from "../shopify/types";

/**
 * Navigation menus for mock mode, keyed by the handles the template requests
 * (`next-js-frontend-header-menu` in the navbar, `next-js-frontend-footer-menu`
 * in the footer). Unknown handles resolve to an empty menu, like Shopify.
 *
 * @example
 * (await getMenu("next-js-frontend-header-menu"))[0]; // { title: "All", path: "/search" }
 * @see ../shopify/storefront.ts#getMenu
 */
const MENUS: Record<string, Menu[]> = {
  "next-js-frontend-header-menu": [
    { title: "All", path: "/search" },
    { title: "Apparel", path: "/search/apparel" },
    { title: "Accessories", path: "/search/accessories" },
    { title: "Learn", path: "/learn" },
  ],
  "next-js-frontend-footer-menu": [
    { title: "Home", path: "/" },
    { title: "About", path: "/about" },
    { title: "Terms & Conditions", path: "/terms-conditions" },
    { title: "Shipping & Return Policy", path: "/shipping-return-policy" },
    { title: "Privacy Policy", path: "/privacy-policy" },
    { title: "FAQ", path: "/frequently-asked-questions" },
  ],
};

export async function getMenu(handle: string): Promise<Menu[]> {
  return MENUS[handle] ?? [];
}
