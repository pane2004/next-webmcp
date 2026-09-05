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
 * Returns `result.data`, or throws `Error(result.error)` when the action failed. Inside a tool's
 * `execute`, `<ModelContext>` turns that throw into
 * `<name> failed: <error>. Check the page state and try again.`, so the agent reads the server's
 * own sentence.
 *
 * @example
 * ```ts
 * execute: () => async (input) => {
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
