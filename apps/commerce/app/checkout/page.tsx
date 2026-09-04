import Footer from "components/layout/footer";
import Price from "components/price";
import { DEFAULT_OPTION } from "lib/constants";
import { getCart } from "lib/shopify";
import type { CartItem } from "lib/shopify/types";
import Image from "next/image";
import Link from "next/link";
import { placeOrder } from "./actions";

export const metadata = {
  title: "Checkout",
  description: "Review your cart and place a demo order.",
};

/**
 * Mock checkout. Lists the cart lines with a total and a single
 * "Place order" action. With `?order=<id>` in the URL it shows the
 * confirmation instead. Nothing is charged and no personal data is collected.
 */
export default async function CheckoutPage(props: { searchParams?: Promise<{ order?: string }> }) {
  const { order } = (await props.searchParams) ?? {};

  return (
    <>
      <div className="mx-auto max-w-(--breakpoint-2xl) px-4">
        <div className="mx-auto max-w-2xl rounded-lg border border-neutral-200 bg-white p-8 md:p-12 dark:border-neutral-800 dark:bg-black">
          {order ? <OrderPlaced orderId={order} /> : <CartSummary />}
        </div>
      </div>
      <Footer />
    </>
  );
}

async function CartSummary() {
  const cart = await getCart();
  const lines = cart?.lines ?? [];

  if (lines.length === 0) {
    return (
      <>
        <h1 className="mb-4 text-3xl font-bold">Checkout</h1>
        <p className="mb-6 text-neutral-500 dark:text-neutral-400">Your cart is empty.</p>
        <Link
          href="/search"
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:opacity-90"
        >
          Continue shopping
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Checkout</h1>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {lines.map((line) => (
          <CheckoutLine key={line.id} line={line} />
        ))}
      </ul>
      <dl className="mt-6 space-y-2 border-t border-neutral-200 pt-6 text-sm dark:border-neutral-700">
        <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
          <dt>Taxes</dt>
          <dd>
            <Price
              amount={cart!.cost.totalTaxAmount.amount}
              currencyCode={cart!.cost.totalTaxAmount.currencyCode}
            />
          </dd>
        </div>
        <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
          <dt>Shipping</dt>
          <dd>Free</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>
            <Price
              amount={cart!.cost.totalAmount.amount}
              currencyCode={cart!.cost.totalAmount.currencyCode}
            />
          </dd>
        </div>
      </dl>
      <form action={placeOrder} className="mt-8">
        <button
          type="submit"
          className="w-full rounded-full bg-blue-600 p-4 text-center text-sm font-medium tracking-wide text-white hover:opacity-90"
        >
          Place order
        </button>
        <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Demo checkout. No payment is taken and no personal details are collected.
        </p>
      </form>
    </>
  );
}

function CheckoutLine({ line }: { line: CartItem }) {
  const { product } = line.merchandise;

  return (
    <li className="flex items-center gap-4 py-4">
      <div className="relative h-16 w-16 flex-none overflow-hidden rounded-md border border-neutral-300 bg-neutral-300 dark:border-neutral-700 dark:bg-neutral-900">
        <Image
          className="h-full w-full object-cover"
          width={64}
          height={64}
          alt={product.featuredImage.altText || product.title}
          src={product.featuredImage.url}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <Link href={`/product/${product.handle}`} className="text-sm font-medium leading-tight">
          {product.title}
        </Link>
        {line.merchandise.title !== DEFAULT_OPTION ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{line.merchandise.title}</p>
        ) : null}
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Qty {line.quantity}</p>
      </div>
      <Price
        className="text-sm"
        amount={line.cost.totalAmount.amount}
        currencyCode={line.cost.totalAmount.currencyCode}
      />
    </li>
  );
}

function OrderPlaced({ orderId }: { orderId: string }) {
  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">Order placed</h1>
      <p className="mb-1 text-neutral-500 dark:text-neutral-400">
        Thanks! Your demo order <span className="font-mono">{orderId}</span> is confirmed.
      </p>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Nothing will ship: this store is a WebMCP demo.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:opacity-90"
      >
        Back to the store
      </Link>
    </>
  );
}
