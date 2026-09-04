import { warnOnce } from "./errors";
import type { ConfirmRequest, ToolCallRecord } from "./types";

/** How long a confirmation card waits before it is treated as denied. */
export const CONFIRM_TIMEOUT_MS = 60_000;
/** Maximum number of call records kept (newest first). */
export const CALL_LOG_LIMIT = 200;

/** A tool registered through `<ModelContext>` and the route that owns it. */
export type RegisteredRoute = {
  readonly route: string;
  readonly title?: string;
  readonly description: string;
};

/** A confirmation awaiting a user decision. */
export type PendingConfirmation = {
  readonly id: string;
  readonly toolName: string;
  readonly request: ConfirmRequest;
  /** Settles the confirmation; later calls are ignored. */
  readonly resolve: (approved: boolean) => void;
};

/** Immutable registry snapshot. Replaced (never mutated) on each change. */
export type RegistryState = {
  readonly tools: Readonly<Record<string, RegisteredRoute>>;
  readonly calls: readonly ToolCallRecord[];
  readonly confirmations: readonly PendingConfirmation[];
};

const EMPTY_STATE: RegistryState = Object.freeze({ tools: {}, calls: [], confirmations: [] });

let state: RegistryState = EMPTY_STATE;
const listeners = new Set<() => void>();
const owners = new Map<string, symbol>();
let counter = 0;

function setState(next: RegistryState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Generates a small unique id (no `crypto` dependency). @internal */
export function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * Tiny external store backing `useToolCalls`, `useModelContextTools` and `<ToolConfirmations/>`.
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
        `[next-webmcp] TOOL_NAME_DUPLICATE: tool "${name}" is registered by more than one <ModelContext>. The later registration wins.`,
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
  recordCall(record: ToolCallRecord): void {
    setState({ ...state, calls: [record, ...state.calls].slice(0, CALL_LOG_LIMIT) });
  },
  /** Queues a confirmation. Resolves `false` on deny, timeout (60 s) or abort. */
  requestConfirm(
    toolName: string,
    request: ConfirmRequest,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return new Promise<boolean>((resolvePromise) => {
      const id = nextId();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = (): void => resolve(false);
      const resolve = (approved: boolean): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (state.confirmations.some((c) => c.id === id)) {
          setState({ ...state, confirmations: state.confirmations.filter((c) => c.id !== id) });
        }
        resolvePromise(approved);
      };
      if (signal?.aborted) {
        resolvePromise(false);
        return;
      }
      timer = setTimeout(() => {
        warnOnce(
          "CONFIRM_TIMEOUT",
          `[next-webmcp] CONFIRM_TIMEOUT: "${toolName}" was not approved within 60 s and was denied.`,
        );
        resolve(false);
      }, CONFIRM_TIMEOUT_MS);
      signal?.addEventListener("abort", onAbort, { once: true });
      setState({
        ...state,
        confirmations: [...state.confirmations, { id, toolName, request, resolve }],
      });
    });
  },
  /** Clears everything (tests only). Pending confirmations are denied. */
  reset(): void {
    for (const c of state.confirmations) c.resolve(false);
    owners.clear();
    counter = 0;
    setState(EMPTY_STATE);
  },
};

/** Type of the registry store. */
export type Registry = typeof registry;
