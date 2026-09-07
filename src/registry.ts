import { warnOnce } from "./errors";
import type { ToolAnnotations, ToolCallRecord } from "./types";

/** Maximum number of call records kept (newest first). */
export const CALL_LOG_LIMIT = 200;

/** A tool registered through `<ModelContext>` and the route that owns it. */
export type RegisteredRoute = {
  readonly route: string;
  readonly title?: string;
  readonly description: string;
  /** The JSON Schema handed to the browser; kept because Chrome 150 returns it as a string. */
  readonly inputSchema?: object;
  readonly annotations?: ToolAnnotations;
};

/** Immutable registry snapshot. Replaced (never mutated) on each change. */
export type RegistryState = {
  readonly tools: Readonly<Record<string, RegisteredRoute>>;
  readonly calls: readonly ToolCallRecord[];
};

const EMPTY_STATE: RegistryState = Object.freeze({ tools: {}, calls: [] });

let state: RegistryState = EMPTY_STATE;
const listeners = new Set<() => void>();
const owners = new Map<string, symbol>();
let counter = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

function setState(next: RegistryState): void {
  state = next;
  notify();
}

/** Generates a small unique id (no `crypto` dependency). @internal */
export function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * Tiny external store backing `useToolCalls` and `useModelContextTools`.
 * `useSyncExternalStore`-compatible: `getState()` returns a stable object until something changes.
 * @internal
 */
export const registry = {
  getState(): RegistryState {
    return state;
  },
  /** Stable server snapshot (always empty). */
  getServerSnapshot(): RegistryState {
    return EMPTY_STATE;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Records a route-scoped registration. Returns an unregister function. Later registrations win. */
  registerTool(name: string, info: RegisteredRoute): () => void {
    if (owners.has(name)) {
      warnOnce(
        `TOOL_NAME_DUPLICATE:${name}`,
        `[next-web-mcp] TOOL_NAME_DUPLICATE: tool "${name}" is registered by more than one <ModelContext>. The later registration wins.`,
      );
    }
    const owner = Symbol(name);
    owners.set(name, owner);
    setState({ ...state, tools: { ...state.tools, [name]: info } });
    return () => {
      if (owners.get(name) !== owner) return;
      owners.delete(name);
      const { [name]: _removed, ...tools } = state.tools;
      void _removed;
      setState({ ...state, tools });
    };
  },
  /**
   * Moves a registered tool to `route` after client-side navigation, so DevTools grouping follows
   * the page without a `document.modelContext` round trip. No-op when `name` is unknown or the
   * route is unchanged (no listener wake-up).
   */
  updateToolRoute(name: string, route: string): void {
    const current = state.tools[name];
    if (current === undefined || current.route === route) return;
    setState({ ...state, tools: { ...state.tools, [name]: { ...current, route } } });
  },
  recordCall(record: ToolCallRecord): void {
    setState({ ...state, calls: [record, ...state.calls].slice(0, CALL_LOG_LIMIT) });
  },
  /** Clears everything (tests only). */
  reset(): void {
    owners.clear();
    counter = 0;
    setState(EMPTY_STATE);
  },
};

/** Type of the registry store. */
export type Registry = typeof registry;
