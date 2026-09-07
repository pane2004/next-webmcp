/**
 * Stable error codes surfaced by next-web-mcp.
 *
 * @see https://github.com/pane2004/next-webmcp#errors
 */
export type NextWebMCPErrorCode =
  | "TOOL_NAME_DUPLICATE"
  | "TOOL_NAME_INVALID"
  | "MODEL_CONTEXT_UNAVAILABLE";

/**
 * Error thrown (or logged) by next-web-mcp. Every instance carries a stable `code`
 * so callers can branch without parsing messages.
 *
 * @example
 * ```ts
 * try {
 *   tool({ name: "bad name!", description: "…", input: z.object({}), execute: () => async () => "" });
 * } catch (err) {
 *   if (err instanceof NextWebMCPError && err.code === "TOOL_NAME_INVALID") {
 *     // …
 *   }
 * }
 * ```
 * @see https://github.com/pane2004/next-webmcp#errors
 */
export class NextWebMCPError extends Error {
  readonly code: NextWebMCPErrorCode;

  constructor(code: NextWebMCPErrorCode, message: string) {
    super(`[next-web-mcp] ${message}`);
    this.name = "NextWebMCPError";
    this.code = code;
  }
}

const warned = new Set<string>();

/** `true` outside production builds. Bundlers inline `process.env.NODE_ENV`. */
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Logs a message once per `key` (dev only; silent in production).
 * @internal
 */
export function warnOnce(key: string, message: string, level: "warn" | "info" = "warn"): void {
  if (!isDev() || warned.has(key)) return;
  warned.add(key);
  console[level](message);
}

/** Clears the warn-once memory. Used by `__resetForTests`. @internal */
export function resetWarnings(): void {
  warned.clear();
}

/** Extracts a safe, stack-free message from an unknown thrown value. @internal */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
