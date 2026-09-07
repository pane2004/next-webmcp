import { NextWebMCPError } from "./errors";
import { toolInputToJsonSchema } from "./schema";
import { assertValidToolName } from "./tool";
import type { ToolAnnotations, ToolDef } from "./types";

/** One tool as listed in the manifest: its JSON Schema input, never its `execute`. */
export type ManifestTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: ToolAnnotations;
};

/** The tools `<ModelContext>` registers under one route pattern, e.g. `/product/[handle]`. */
export type ManifestRoute = { route: string; tools: ManifestTool[] };

/** The document served at `/.well-known/webmcp.json`. */
export type WebMCPManifest = { version: 1; routes: ManifestRoute[] };

/** Route pattern → the tool definitions mounted there. */
export type ManifestRoutes = Record<string, ToolDef[]>;

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "public, max-age=300",
} as const;

function toManifestTool(def: ToolDef, route: string): ManifestTool {
  if (def.name === undefined) {
    throw new NextWebMCPError(
      "TOOL_NAME_INVALID",
      `A tool under route "${route}" has no name. Set "name" or create it with defineTools() so the key becomes the name.`,
    );
  }
  assertValidToolName(def.name);
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: toolInputToJsonSchema(def.input),
    annotations: def.annotations,
  };
}

/**
 * Builds the `/.well-known/webmcp.json` document from the same tool definitions
 * `<ModelContext>` registers, so the manifest can never drift from the app.
 * Each tool's Zod `input` becomes JSON Schema; `execute` is left out.
 *
 * @example
 * ```ts
 * buildManifest({ "/": rootTools, "/product/[handle]": createProductTools(sample) });
 * // → { version: 1, routes: [{ route: "/", tools: [{ name, description, inputSchema, … }] }, …] }
 * ```
 * @throws NextWebMCPError `TOOL_NAME_INVALID` when a definition has no (or an invalid) name.
 * @see https://github.com/pane2004/next-webmcp#manifest
 */
export function buildManifest(routes: ManifestRoutes): WebMCPManifest {
  return {
    version: 1,
    routes: Object.entries(routes).map(([route, tools]) => ({
      route,
      tools: tools.map((def) => toManifestTool(def, route)),
    })),
  };
}

/**
 * Creates the `GET` handler for an App Router route at `app/.well-known/webmcp.json/route.ts`.
 * The response is JSON (`content-type: application/json`) with `Cache-Control: public, max-age=300`.
 * A static `routes` map is validated once, when the handler is created, so a bad tool fails
 * `next build` instead of a request; a factory runs on every request and may be async
 * (load collections, pick a sample product, …).
 *
 * @example
 * ```ts
 * // app/.well-known/webmcp.json/route.ts
 * import { createManifestHandler } from "nextjs-webmcp/manifest";
 * export const GET = createManifestHandler(async () => ({
 *   "/": rootTools,
 *   "/search": createSearchTools(await getCollections()),
 * }));
 * ```
 * @see https://github.com/pane2004/next-webmcp#manifest
 */
export function createManifestHandler(
  routes: ManifestRoutes | (() => ManifestRoutes | Promise<ManifestRoutes>),
): () => Promise<Response> {
  if (typeof routes !== "function") {
    const body = JSON.stringify(buildManifest(routes));
    return async () => new Response(body, { headers: HEADERS });
  }
  return async () =>
    new Response(JSON.stringify(buildManifest(await routes())), { headers: HEADERS });
}
