import type { z } from "zod";
import { NextWebMCPError } from "./errors";
import { toolInputToJsonSchema } from "./schema";
import type { AnyZodSchema, ToolDef } from "./types";

/** Chrome's tool-name rule: 1–128 chars of ASCII alphanumerics, `_`, `-`, `.`. */
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Throws `NextWebMCPError` (`TOOL_NAME_INVALID`) when `name` does not match Chrome's rule.
 * @internal
 */
export function assertValidToolName(name: string): void {
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new NextWebMCPError(
      "TOOL_NAME_INVALID",
      `Tool name "${name}" is invalid. Use 1–128 ASCII letters, digits, "_", "-" or ".".`,
    );
  }
}

/**
 * Defines a tool with full type inference from its Zod `input` schema.
 * Validates the name and converts `input` to JSON Schema right away, so a bad name fails at
 * definition time rather than silently in render.
 *
 * @throws NextWebMCPError `TOOL_NAME_INVALID`.
 * @example
 * ```ts
 * const addToCart = tool({
 *   name: "addToCart",
 *   description: "Add a product to the cart",
 *   input: z.object({ sku: z.string(), qty: z.number().int().min(1) }),
 *   execute: (ctx) => async ({ sku, qty }) => {
 *     await addToCartAction(sku, qty); // server action
 *     return `Added ${qty} × ${sku}`;
 *   },
 * });
 * ```
 * @see https://github.com/pane2004/next-webmcp#tool
 */
export function tool<TInput extends z.ZodTypeAny>(def: ToolDef<TInput>): ToolDef<TInput> {
  if (def.name !== undefined) assertValidToolName(def.name);
  toolInputToJsonSchema(def.input);
  return def;
}

/**
 * Turns a `{ key: ToolDef }` map into a `ToolDef[]`, using each key as the tool `name`
 * when the definition has none.
 *
 * @example
 * ```ts
 * const tools = defineTools({
 *   search: tool({ description: "Search products", input: z.object({ q: z.string() }), execute: … }),
 * });
 * // tools[0].name === "search"
 * ```
 * @throws NextWebMCPError `TOOL_NAME_INVALID`.
 * @see https://github.com/pane2004/next-webmcp#definetools
 */
export function defineTools(map: Record<string, ToolDef<AnyZodSchema>>): ToolDef[] {
  return Object.entries(map).map(([key, def]) => {
    const name = def.name ?? key;
    assertValidToolName(name);
    toolInputToJsonSchema(def.input);
    return def.name === name ? def : { ...def, name };
  });
}
