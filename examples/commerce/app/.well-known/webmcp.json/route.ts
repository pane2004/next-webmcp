import { tool } from "next-web-mcp";
import { createManifestHandler } from "next-web-mcp/manifest";
import { createProductTools } from "app/product/[handle]/tools";
import { createSearchTools } from "app/search/tools";
import { createRootTools } from "app/tools";
import { cartApiStub } from "lib/mock/cart-api-stub";
import { getCollections, getProduct, getProducts } from "lib/shopify";
import { newsletterInput } from "lib/tool-schemas";

/** Any product will do: the product-page tools describe themselves the same way for every product. */
const SAMPLE_PRODUCT_HANDLE = "acme-slip-on-shoes";

/**
 * The newsletter form (`components/newsletter/newsletter-form.tsx`) is a declarative WebMCP
 * tool registered by the browser from `<form toolname>` markup, so it has no `ToolDef`.
 * This manifest-only definition mirrors that markup with the schema its server action
 * validates against; its `execute` never runs.
 */
const newsletterFormTool = tool({
  name: "subscribe_newsletter",
  description: "Subscribe an email address to the Acme newsletter.",
  input: newsletterInput,
  execute: () => async () => "Handled by the declarative <form toolname> in the footer.",
});

/**
 * Serves `/.well-known/webmcp.json`, listing the tools each route registers.
 * Built from the same definitions `<ModelContext>` mounts, so it cannot drift from the app.
 *
 * @example
 * curl -s https://next-webmcp-commerce.vercel.app/.well-known/webmcp.json
 * @see app/tools.ts, app/product/[handle]/tools.ts, app/search/tools.ts
 */
export const GET = createManifestHandler(async () => {
  const [sample, collections] = await Promise.all([
    getProduct(SAMPLE_PRODUCT_HANDLE).then(
      async (product) => product ?? (await getProducts({}))[0],
    ),
    getCollections(),
  ]);
  // The manifest only needs each tool's name, description and input schema:
  // `execute` never runs here, so a stub cart api and any product will do.
  return {
    "/": [...createRootTools(cartApiStub), newsletterFormTool],
    ...(sample ? { "/product/[handle]": createProductTools(sample, cartApiStub) } : {}),
    "/search": createSearchTools(collections),
  };
});
