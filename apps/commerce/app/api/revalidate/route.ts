import { isMockCommerce } from "lib/mock/mode";
import { revalidate } from "lib/shopify";
import { NextRequest, NextResponse } from "next/server";

/**
 * Shopify webhook target. In mock mode there is no remote catalog to
 * revalidate, so the handler acknowledges the request and reports the mode.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (isMockCommerce()) {
    return NextResponse.json({ status: 200, mode: "mock" });
  }

  return revalidate(req);
}
