import Footer from "components/layout/footer";
import type { Metadata } from "next";
import Link from "next/link";
import { ToolList } from "./tool-list";

export const metadata: Metadata = {
  title: "Learn",
  description: "How this store exposes WebMCP tools to browser agents with next-webmcp.",
};

export default function LearnPage() {
  return (
    <>
      <div className="mx-auto max-w-(--breakpoint-2xl) px-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-8 md:p-12 dark:border-neutral-800 dark:bg-black">
          <h1 className="mb-6 text-4xl font-medium">WebMCP in this store</h1>
          <div className="prose prose-neutral max-w-3xl text-sm leading-relaxed dark:prose-invert">
            <p>
              WebMCP is a browser API, shipping in Chrome behind an origin trial, that lets a page
              register tools on <code>document.modelContext</code>. A browser-based agent can then
              read those tools and call them directly instead of guessing at buttons and forms. Each
              tool has a name, a description written for the model, a JSON Schema for its input, and
              an <code>execute</code> function that returns text the agent can read.
            </p>
            <p>
              This store uses <code>next-webmcp</code> to register tools from React components, so
              they follow the App Router: the root layout provides <code>search_products</code>,{" "}
              <code>get_cart</code>, <code>update_quantity</code>, <code>remove_item</code>,{" "}
              <code>navigate_to</code> and <code>start_checkout</code>; a product page adds{" "}
              <code>get_product</code> and <code>add_to_cart</code>; a search page adds{" "}
              <code>refine_results</code>. Tools unregister when their route unmounts. The
              newsletter form in the footer is a declarative tool (<code>subscribe_newsletter</code>
              ) that Chrome fills in and submits by itself.
            </p>
            <p>
              Every tool call updates the page, so the shopper can confirm what the agent did:
              adding an item opens the cart, refining results changes the URL, and{" "}
              <code>start_checkout</code> shows an approval card before anything happens. The panel
              in the bottom-right corner lists the registered tools, runs them with sample
              arguments, and logs each call.
            </p>
          </div>

          <h2 className="mb-2 mt-10 text-2xl font-medium">Tools on this page</h2>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            This list is live. Navigate to a{" "}
            <Link href="/search" className="underline underline-offset-4">
              product page
            </Link>{" "}
            and watch the list change.
          </p>
          <ToolList />
        </div>
      </div>
      <Footer />
    </>
  );
}
