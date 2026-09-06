"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getModelContext, subscribeToolChange } from "./native";
import { registry } from "./registry";
import type { RegisteredToolInfo, ToolCallRecord } from "./types";

const EMPTY_CALLS: readonly ToolCallRecord[] = [];

/**
 * Live log of tool calls handled by `<ModelContext>` (newest first, max 200).
 *
 * @example
 * ```tsx
 * const calls = useToolCalls();
 * return <ul>{calls.map((c) => <li key={c.id}>{c.name} → {c.result}</li>)}</ul>;
 * ```
 * @see https://github.com/pane2004/next-webmcp#usetoolcalls
 */
export function useToolCalls(): ToolCallRecord[] {
  const calls = useSyncExternalStore(
    registry.subscribe,
    () => registry.getState().calls,
    () => EMPTY_CALLS,
  );
  return calls as ToolCallRecord[];
}

/**
 * Live list of tools on `document.modelContext` (via `getTools()` + `toolchange`),
 * merged with the route that registered each one. Empty when WebMCP is unavailable.
 *
 * @example
 * ```tsx
 * const tools = useModelContextTools();
 * return <p>{tools.length} tools live on {tools[0]?.route}</p>;
 * ```
 * @see https://github.com/pane2004/next-webmcp#usemodelcontexttools
 */
/** Chrome 150 hands `RegisteredTool.inputSchema` back as a JSON string; the spec says object. */
function parseNativeSchema(value: unknown): object | undefined {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === "object" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return value !== null && typeof value === "object" ? value : undefined;
}

export function useModelContextTools(): RegisteredToolInfo[] {
  const [native, setNative] = useState<WebMCP.RegisteredTool[]>([]);
  const routes = useSyncExternalStore(
    registry.subscribe,
    () => registry.getState().tools,
    () => registry.getServerSnapshot().tools,
  );

  useEffect(() => {
    const mc = getModelContext();
    if (!mc) return;
    let cancelled = false;
    const refresh = (): void => {
      mc.getTools()
        .then((list) => {
          if (!cancelled) setNative(list);
        })
        .catch(() => {});
    };
    refresh();
    const unsubscribe = subscribeToolChange(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [routes]);

  return useMemo(
    () =>
      native.map((t) => {
        const own = routes[t.name];
        // Prefer own copy: Chrome 150 returns title "", inputSchema as a JSON string, no annotations.
        const info: RegisteredToolInfo = {
          name: t.name,
          description: t.description,
          title: t.title || undefined,
          inputSchema: own?.inputSchema ?? parseNativeSchema(t.inputSchema),
          annotations: own?.annotations ?? t.annotations,
          route: own?.route,
        };
        return info;
      }),
    [native, routes],
  );
}
