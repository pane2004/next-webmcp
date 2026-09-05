import * as zod from "zod";
import type { z } from "zod";
import { NextWebMCPError } from "./errors";

type ToJSONSchema = (
  schema: z.ZodTypeAny,
  params?: { io?: "input" | "output"; unrepresentable?: "any" },
) => object;

const cache = new WeakMap<z.ZodTypeAny, object>();

/**
 * Converts a Zod schema to a JSON Schema object suitable for `inputSchema`.
 * Strips the `$schema` key. Requires Zod 4 (`z.toJSONSchema`). Results are cached per
 * schema instance, so `tool()` can convert eagerly and `<ModelContext>` reuses the result.
 *
 * @example
 * ```ts
 * toolInputToJsonSchema(z.object({ q: z.string() }));
 * // → { type: "object", properties: { q: { type: "string" } }, required: ["q"] }
 * ```
 * @throws NextWebMCPError `ZOD_TO_JSON_SCHEMA_UNSUPPORTED` when the installed Zod lacks `toJSONSchema`.
 * @internal
 */
export function toolInputToJsonSchema(schema: z.ZodTypeAny): object {
  const cached = cache.get(schema);
  if (cached) return cached;
  const toJSONSchema = (zod as { toJSONSchema?: unknown }).toJSONSchema;
  if (typeof toJSONSchema !== "function") {
    throw new NextWebMCPError(
      "ZOD_TO_JSON_SCHEMA_UNSUPPORTED",
      "z.toJSONSchema is not available. Upgrade to zod@4 (`pnpm add zod@^4`).",
    );
  }
  const json = (toJSONSchema as ToJSONSchema)(schema, { io: "input", unrepresentable: "any" });
  const { $schema: _ignored, ...rest } = json as { $schema?: string } & Record<string, unknown>;
  void _ignored;
  cache.set(schema, rest);
  return rest;
}

/** The part of a Zod issue this package reads: where it happened and why. */
export type ZodIssueLike = { readonly path: ReadonlyArray<PropertyKey>; readonly message: string };

/**
 * Formats Zod issues as `path: message` pairs joined by `; ` (nested paths are dotted, a
 * top-level issue reads `(root)`). `<ModelContext>` and `toolAction()` both use it, so an agent
 * sees the same wording whether the client or the server rejected the arguments.
 *
 * @example
 * ```ts
 * formatZodIssues(z.object({ q: z.string().min(1) }).safeParse({ q: "" }).error!.issues);
 * // → "q: Too small: expected string to have >=1 characters"
 * ```
 * @internal
 */
export function formatZodIssues(issues: ReadonlyArray<ZodIssueLike>): string {
  return issues
    .map(
      (issue) =>
        `${issue.path.length ? issue.path.map(String).join(".") : "(root)"}: ${issue.message}`,
    )
    .join("; ");
}
