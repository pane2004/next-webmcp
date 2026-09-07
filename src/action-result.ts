/**
 * What a `toolAction()` server action resolves to: a plain, serializable object that carries
 * either the handler's data or a sentence the agent can act on. Failures are returned, never
 * thrown, because Next.js redacts thrown server-action errors in production.
 *
 * @example
 * ```ts
 * const result = await searchProducts({ q: "shoes" });
 * if (!result.ok) return result.error; // "Invalid input: q: Too small: … Fix the arguments and call again."
 * return `${result.data.length} products found`;
 * ```
 * @see https://github.com/pane2004/next-webmcp#toolaction
 */
export type ToolActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Returns `result.data`, or throws `Error(result.error)` when the action failed. You only need it
 * to format `data` yourself: returning the result from `execute` unchanged has the same effect,
 * because `<ModelContext>` unwraps it and turns `error` into
 * `<name> failed: <error>. Check the page state and try again.`
 *
 * @example
 * ```ts
 * execute: async (input) => {
 *   const products = unwrap(await searchProducts(input));
 *   return `${products.length} products found`;
 * },
 * ```
 * @see https://github.com/pane2004/next-webmcp#unwrap
 */
export function unwrap<T>(result: ToolActionResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(result.error);
}

/** `true` for the `{ ok, data | error }` object a `toolAction()` resolves to. @internal */
export function isToolActionResult(value: unknown): value is ToolActionResult<unknown> {
  if (value === null || typeof value !== "object" || !("ok" in value)) return false;
  const r = value as { ok: unknown; error?: unknown };
  return r.ok === true ? "data" in r : r.ok === false && typeof r.error === "string";
}
