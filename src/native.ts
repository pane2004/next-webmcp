import { NextWebMCPError } from "./errors";

/** Returns `document.modelContext` when the browser supports WebMCP. Safe on the server. */
export function getModelContext(): WebMCP.ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  return document.modelContext;
}

/**
 * Feature-detects WebMCP (`document.modelContext`). Always `false` on the server.
 *
 * @example
 * ```ts
 * if (isModelContextAvailable()) console.log("agent tools are live");
 * ```
 * @see https://developer.chrome.com/docs/ai/webmcp
 */
export function isModelContextAvailable(): boolean {
  return getModelContext() !== undefined;
}

/** Subscribes to `toolchange`; returns an unsubscribe function. No-op without WebMCP. @internal */
export function subscribeToolChange(callback: () => void): () => void {
  const mc = getModelContext();
  if (!mc) return () => {};
  mc.addEventListener("toolchange", callback);
  return () => mc.removeEventListener("toolchange", callback);
}

type ExecuteToolFn = (
  tool: WebMCP.RegisteredTool,
  json: string,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

/**
 * Calls the Chrome dev-only `document.modelContext.executeTool(name, jsonString)`.
 * Returns `null` when the tool triggered a navigation.
 * @throws NextWebMCPError `MODEL_CONTEXT_UNAVAILABLE` when WebMCP or `executeTool` is missing.
 * @internal
 */
export async function executeTool(
  name: string,
  json: string,
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  const mc = getModelContext();
  const fn = (mc as { executeTool?: unknown } | undefined)?.executeTool;
  if (!mc || typeof fn !== "function") {
    throw new NextWebMCPError(
      "MODEL_CONTEXT_UNAVAILABLE",
      "document.modelContext.executeTool is unavailable in this browser.",
    );
  }
  // Chrome requires the RegisteredTool object from getTools(); a bare name is rejected with
  // "The provided value is not of type RegisteredTool".
  const tools = await mc.getTools();
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new NextWebMCPError(
      "MODEL_CONTEXT_UNAVAILABLE",
      `No registered tool named "${name}". Call getTools() to see what is available.`,
    );
  }
  return (fn as ExecuteToolFn).call(mc, tool, json, options);
}
