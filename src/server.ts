/*
 * `nextjs-webmcp/server`: helpers for the server side of a tool. Server-safe by construction:
 * no React, no "use client", nothing that reads `document` or `window`.
 */
import type { z } from "zod";
import type { ToolActionResult } from "./action-result";
import { formatZodIssues } from "./schema";

export type { ToolActionResult } from "./action-result";

/** Options for {@link toolAction}. */
export type ToolActionOptions<R> = {
  /**
   * Validates what the handler returns before it leaves the server. On failure the agent gets
   * `The server returned an unexpected result.` and the issues go to `console.error`. On
   * success the parsed value is returned, so unknown keys are stripped like any Zod object.
   */
  output?: z.ZodType<R>;
  /**
   * Turns a thrown error into the sentence the agent sees. By default the error only reaches
   * `console.error` and the agent reads `The action failed on the server. Try again.`, so
   * messages meant for logs never leak into a tool result.
   */
  onError?: (error: unknown) => string;
};

const GENERIC_FAILURE = "The action failed on the server. Try again.";
const UNEXPECTED_RESULT = "The server returned an unexpected result.";

function describeFailure(err: unknown, onError: ((error: unknown) => string) | undefined): string {
  if (onError === undefined) return GENERIC_FAILURE;
  try {
    return onError(err) ?? GENERIC_FAILURE;
  } catch (mapError) {
    console.error(mapError);
    return GENERIC_FAILURE;
  }
}

/**
 * Wraps a server action so it validates its input, never throws, and always resolves to a
 * {@link ToolActionResult}: `{ ok: true, data }` or `{ ok: false, error }` with a sentence the
 * agent can act on. Use it in a `"use server"` file; the returned async function is the action.
 *
 * - Input is parsed with `safeParseAsync` (defaults and transforms apply). Invalid input resolves
 *   to `Invalid input: <path>: <message>; … Fix the arguments and call again.`, worded exactly
 *   like the client-side check in `<ModelContext>`.
 * - A thrown handler error is logged with `console.error` and resolves to
 *   `The action failed on the server. Try again.` (or whatever `onError` returns). The thrown
 *   message is never returned by default: Next.js redacts it in production anyway, and returning
 *   a result keeps the wording under your control in development too. A `.transform` or
 *   `.refine` body that throws a non-Zod error during either parse is handled the same way, so
 *   the action never rejects.
 * - An optional `output` schema checks the handler's result and resolves to
 *   `The server returned an unexpected result.` when it does not match.
 *
 * Pair it with `unwrap()` from `nextjs-webmcp` inside a tool's `execute`.
 *
 * @example
 * ```ts
 * // app/search/actions.ts
 * "use server";
 * import { toolAction } from "nextjs-webmcp/server";
 *
 * export const searchProducts = toolAction(
 *   z.object({ q: z.string().min(1), page: z.number().int().min(1).default(1) }),
 *   async ({ q, page }) => db.products.search(q, { page }),
 *   { output: z.array(productSummary) },
 * );
 * ```
 * @see https://github.com/pane2004/next-webmcp#toolaction
 */
export function toolAction<S extends z.ZodTypeAny, R>(
  input: S,
  handler: (input: z.infer<S>) => Promise<R> | R,
  options: ToolActionOptions<R> = {},
): (raw: unknown) => Promise<ToolActionResult<R>> {
  const { output, onError } = options;
  return async (raw: unknown): Promise<ToolActionResult<R>> => {
    try {
      const parsed = await input.safeParseAsync(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Invalid input: ${formatZodIssues(parsed.error.issues)}. Fix the arguments and call again.`,
        };
      }
      const result: R = await handler(parsed.data);
      if (output === undefined) return { ok: true, data: result };
      const checked = await output.safeParseAsync(result);
      if (!checked.success) {
        console.error(
          `[nextjs-webmcp] toolAction: the handler's result failed the output schema: ${formatZodIssues(checked.error.issues)}`,
        );
        return { ok: false, error: UNEXPECTED_RESULT };
      }
      return { ok: true, data: checked.data };
    } catch (err) {
      // The handler threw, or a `.transform`/`.refine` body in `input` or `output` threw a
      // non-Zod error (Zod rethrows those from safeParseAsync). Either way the action resolves.
      console.error(err);
      return { ok: false, error: describeFailure(err, onError) };
    }
  };
}
