import { NextRequest, NextResponse } from "next/server";

/**
 * Mock-mode counterpart of the Shopify webhook handler. There is nothing to
 * revalidate (the catalog lives in memory), so it acknowledges the request.
 *
 * @example
 * // app/api/revalidate/route.ts
 * export async function POST(req: NextRequest) { return revalidate(req); }
 * @see ../shopify/storefront.ts#revalidate
 */
export async function revalidate(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ status: 200, mode: "mock" });
}
