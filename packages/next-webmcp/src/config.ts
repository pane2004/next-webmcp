import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** One route entry in `public/.well-known/webmcp.json`. */
export type WebMCPManifestRoute = {
  route: string;
  tools: Array<{ name: string; description: string; inputSchema?: object }>;
};

/** Options for {@link withWebMCP}. */
export type WithWebMCPOptions = {
  manifest?: {
    routes: WebMCPManifestRoute[];
    /** Defaults to `public/.well-known/webmcp.json` (relative to `process.cwd()`). */
    outFile?: string;
  };
};

/** Default manifest location, relative to the Next.js project root. */
export const DEFAULT_MANIFEST_PATH = "public/.well-known/webmcp.json";

/**
 * Wraps `next.config` and, when `manifest` is given, writes `public/.well-known/webmcp.json`
 * synchronously at config-load time so crawlers/agents can discover tools per route.
 * Returns the config untouched otherwise.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withWebMCP } from "next-webmcp/config";
 * export default withWebMCP({ reactStrictMode: true }, {
 *   manifest: { routes: [{ route: "/products/[id]", tools: [{ name: "addToCart", description: "Add to cart" }] }] },
 * });
 * ```
 * @see https://github.com/pane2004/next-webmcp#withwebmcp
 */
export function withWebMCP<T extends object>(nextConfig: T, options?: WithWebMCPOptions): T {
  const manifest = options?.manifest;
  if (manifest) {
    const outFile = resolve(process.cwd(), manifest.outFile ?? DEFAULT_MANIFEST_PATH);
    mkdirSync(dirname(outFile), { recursive: true });
    const body = { version: 1, generator: "next-webmcp", routes: manifest.routes };
    writeFileSync(outFile, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  }
  return nextConfig;
}
