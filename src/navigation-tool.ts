import { z } from "zod";
import { NextWebMCPError } from "./errors";
import { formatZodIssues } from "./schema";
import { tool } from "./tool";
import type { ToolContext, ToolDef } from "./types";

/**
 * One page an agent may open through {@link navigationTool}.
 *
 * `path` is an App Router pattern: static (`/search`), with dynamic segments
 * (`/product/[handle]`), a catch-all (`/docs/[...slug]`) or an optional catch-all
 * (`/docs/[[...slug]]`). Every non-optional segment must be present in the call's `params`.
 *
 * @example
 * ```ts
 * const product: NavigationRoute = {
 *   path: "/product/[handle]",
 *   description: "Product detail page; adds get_product and add_to_cart.",
 *   params: z.object({ handle: z.string().regex(/^[a-z0-9-]+$/) }),
 * };
 * ```
 * @see https://github.com/pane2004/next-webmcp#navigationtool
 */
export type NavigationRoute = {
  /** App Router path pattern, exactly as the agent names it, e.g. `"/product/[handle]"`. */
  path: string;
  /** What the page shows or does. The agent reads this to pick a route. */
  description: string;
  /**
   * Extra validation for `params`, keyed by segment name. Presence of every `[segment]` is
   * checked regardless; use this to constrain values (a regex, an enum of known handles, …).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: z.ZodObject<any>;
  /** Validation for `query`. Its keys are listed in the tool description. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query?: z.ZodObject<any>;
};

type Segment = {
  /** Literal token in the path, e.g. `[handle]` or `[[...slug]]`. */
  token: string;
  name: string;
  catchAll: boolean;
  optional: boolean;
};

/** `[[...name]]` (optional catch-all), `[...name]` (catch-all) or `[name]` (dynamic segment). */
const SEGMENT_PATTERN = /\[\[\.\.\.([^\]]+)\]\]|\[\.\.\.([^\]]+)\]|\[([^\]]+)\]/g;

function parseSegments(path: string): Segment[] {
  const segments: Segment[] = [];
  for (const match of path.matchAll(SEGMENT_PATTERN)) {
    const [token, optionalName, catchAllName, plainName] = match;
    if (optionalName !== undefined) {
      segments.push({ token, name: optionalName, catchAll: true, optional: true });
    } else if (catchAllName !== undefined) {
      segments.push({ token, name: catchAllName, catchAll: true, optional: false });
    } else if (plainName !== undefined) {
      segments.push({ token, name: plainName, catchAll: false, optional: false });
    }
  }
  return segments;
}

/** Pieces of a catch-all value: split on `/`, empty pieces dropped so `//host` can never form. */
function catchAllPieces(value: string): string[] {
  return value.split("/").filter((piece) => piece.length > 0);
}

function hasValue(segment: Segment, value: unknown): boolean {
  if (typeof value !== "string") return false;
  return segment.catchAll ? catchAllPieces(value).length > 0 : value.length > 0;
}

/**
 * Encodes one segment value. Plain segments go through `encodeURIComponent` whole, so `/`, `\`,
 * `?` and `#` can never escape the segment; catch-all values keep their `/` separators but every
 * piece is encoded the same way.
 */
function encodeSegment(segment: Segment, value: string): string {
  return segment.catchAll
    ? catchAllPieces(value).map(encodeURIComponent).join("/")
    : encodeURIComponent(value);
}

/** Keys of a Zod object, split into required and optional (accepts `undefined`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeKeys(schema: z.ZodObject<any>): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const [key, field] of Object.entries(shape)) {
    (field.safeParse(undefined).success ? optional : required).push(key);
  }
  return { required, optional };
}

/** One line of the tool description: `<path> — <description>` plus what the route needs. */
function describeRoute(route: NavigationRoute): string {
  const segments = parseSegments(route.path);
  const requiredParams = segments.filter((s) => !s.optional).map((s) => s.name);
  const optionalParams = segments.filter((s) => s.optional).map((s) => s.name);
  const notes: string[] = [];
  if (requiredParams.length) notes.push(`Needs params: ${requiredParams.join(", ")}.`);
  if (optionalParams.length) notes.push(`Optional params: ${optionalParams.join(", ")}.`);
  if (route.query) {
    const { required, optional } = describeKeys(route.query);
    const parts: string[] = [];
    if (required.length) parts.push(required.join(", "));
    if (optional.length) parts.push(`optional: ${optional.join(", ")}`);
    if (parts.length) notes.push(`Query: ${parts.join("; ")}.`);
  }
  const line = `${route.path} — ${route.description}`;
  return notes.length ? `${line} ${notes.join(" ")}` : line;
}

function toQueryString(values: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  return search.toString();
}

/**
 * Builds a navigation tool from an allowlist of routes. The agent picks a `route` pattern,
 * supplies `params` for its `[segment]`s and an optional `query`; the tool interpolates the
 * href (every value `encodeURIComponent`-encoded), returns `Navigating to <href>.` and then
 * calls `router.push` (or `router.replace`) in a `setTimeout(…, 0)`.
 *
 * The href is same-origin by construction: only listed patterns are accepted and no agent
 * input can escape a segment, so no URL parsing or origin check is needed. The tool carries no
 * `readOnlyHint` because it changes the page.
 *
 * @throws NextWebMCPError `TOOL_NAME_INVALID` when `routes` is empty or `name` breaks Chrome's rule.
 * @example
 * ```ts
 * const rootTools = defineTools({
 *   navigate_to: navigationTool({
 *     routes: [
 *       { path: "/", description: "Home page." },
 *       { path: "/search", description: "Search results.", query: z.object({ q: z.string() }) },
 *       { path: "/product/[handle]", description: "Product page; adds add_to_cart." },
 *     ],
 *   }),
 * });
 * // Agent call: { route: "/product/[handle]", params: { handle: "acme-cup" } }
 * // → "Navigating to /product/acme-cup." then router.push("/product/acme-cup")
 * ```
 * @see https://github.com/pane2004/next-webmcp#navigationtool
 */
export function navigationTool(options: {
  /** Pages the agent may open. Must contain at least one route. */
  routes: NavigationRoute[];
  /** Tool name. Defaults to `"navigate_to"`. */
  name?: string;
  /** Leading sentence of the tool description; the route list is appended after it. */
  description?: string;
  /** Use `router.replace` instead of `router.push`. Defaults to `false`. */
  replace?: boolean;
  /** Forwarded to the router as `{ scroll }` when set. */
  scroll?: boolean;
}): ToolDef {
  const { routes, name = "navigate_to", replace = false, scroll } = options;
  if (routes.length === 0) {
    throw new NextWebMCPError(
      "TOOL_NAME_INVALID",
      `navigationTool("${name}") needs at least one route.`,
    );
  }
  const paths = routes.map((route) => route.path) as [string, ...string[]];
  const available = paths.join(", ");
  const description = [
    options.description ?? "Open another page of this site.",
    "Routes:",
    ...routes.map((route) => `- ${describeRoute(route)}`),
  ].join("\n");

  const input = z.object({
    route: z
      .enum(paths)
      .describe(
        `The route pattern to open, exactly as listed in the tool description, e.g. "${paths[0]}".`,
      ),
    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Values for the route\'s [segment] placeholders, keyed by segment name, e.g. { "handle": "acme-cup" } for /product/[handle].',
      ),
    query: z
      .record(z.string(), z.string())
      .optional()
      .describe('Query-string parameters to append, e.g. { "q": "shirt" }.'),
  });

  return tool({
    name,
    description,
    input,
    execute: (ctx: ToolContext) => async (call) => {
      const route = routes.find((candidate) => candidate.path === call.route);
      if (!route) {
        return `Unknown route "${call.route}". Available: ${available}.`;
      }

      const rawParams = call.params ?? {};
      const segments = parseSegments(route.path);
      const missing = segments.filter((s) => !s.optional && !hasValue(s, rawParams[s.name]));
      if (missing.length) {
        return `Route "${route.path}" needs params: ${missing.map((s) => s.name).join(", ")}.`;
      }
      let params: Record<string, unknown> = rawParams;
      if (route.params) {
        const parsed = route.params.safeParse(rawParams);
        if (!parsed.success) {
          return `Invalid params for route "${route.path}": ${formatZodIssues(parsed.error.issues)}. Fix the arguments and call again.`;
        }
        params = parsed.data as Record<string, unknown>;
      }

      let pathname = route.path;
      for (const segment of segments) {
        const value = params[segment.name];
        if (segment.optional && !hasValue(segment, value)) {
          pathname = pathname.replace(`/${segment.token}`, "");
          continue;
        }
        pathname = pathname.replace(segment.token, encodeSegment(segment, String(value)));
      }
      if (pathname === "") pathname = "/";

      let query: Record<string, unknown> = call.query ?? {};
      if (route.query) {
        const parsed = route.query.safeParse(query);
        if (!parsed.success) {
          return `Invalid query for route "${route.path}": ${formatZodIssues(parsed.error.issues)}. Fix the arguments and call again.`;
        }
        query = parsed.data as Record<string, unknown>;
      }
      const search = toQueryString(query);
      const href = search ? `${pathname}?${search}` : pathname;

      // Return first, then navigate: a navigation during execute makes
      // Chrome's executeTool resolve to null instead of this string.
      const navigateOptions = scroll === undefined ? undefined : { scroll };
      setTimeout(() => {
        if (replace) ctx.router.replace(href, navigateOptions);
        else ctx.router.push(href, navigateOptions);
      }, 0);
      return `Navigating to ${href}.`;
    },
  });
}
