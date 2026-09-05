import { NextWebMCPError, warnOnce } from "./errors";
import type { ConfirmRequest, ToolCallRecord } from "./types";

/** How long a confirmation card waits before it is treated as denied. */
export const CONFIRM_TIMEOUT_MS = 60_000;
/** Maximum number of call records kept (newest first). */
export const CALL_LOG_LIMIT = 200;

/** A tool registered through `<ModelContext>` and the route that owns it. */
import type { ToolAnnotations } from "./types";

export type RegisteredRoute = {
  readonly route: string;
  readonly title?: string;
  readonly description: string;
  /** The JSON Schema handed to the browser; kept because Chrome 150 returns it as a string. */
  readonly inputSchema?: object;
  readonly annotations?: ToolAnnotations;
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
/** Mounted `<ToolConfirmations/>` instances in mount order. The first one draws the card. */
const renderers = new Map<string, () => void>();
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
  /**
   * Like `subscribe`, but also counts the caller as a confirmation renderer (`<ToolConfirmations/>`).
   * `requestConfirm` fails fast while no renderer is mounted, and only the first mounted renderer
   * (see `primaryConfirmationRenderer`) draws the card so duplicate mounts stay harmless.
   */
  subscribeConfirmations(id: string, listener: () => void): () => void {
    listeners.add(listener);
    renderers.set(id, listener);
    notify();
    return () => {
      listeners.delete(listener);
      if (renderers.get(id) === listener) renderers.delete(id);
      notify();
    };
  },
  /** Id of the renderer that draws the card (the first mounted one); `undefined` when none. */
  primaryConfirmationRenderer(): string | undefined {
    for (const id of renderers.keys()) return id;
    return undefined;
  },
  /** Number of mounted confirmation renderers. */
  confirmationRendererCount(): number {
    return renderers.size;
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
  /**
   * Queues a confirmation. Resolves `false` on deny, timeout (60 s) or abort.
   * Rejects with `CONFIRM_NO_RENDERER` right away when no `<ToolConfirmations/>` is mounted,
   * so a misconfigured app fails loudly instead of hanging until the timeout.
   */
  requestConfirm(
    toolName: string,
    request: ConfirmRequest,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (renderers.size === 0) {
      return Promise.reject(
        new NextWebMCPError(
          "CONFIRM_NO_RENDERER",
          `Tool "${toolName}" needs approval but no <ToolConfirmations/> is mounted. Keep the default confirmations on <ModelContext>, or mount <ToolConfirmations/> yourself.`,
        ),
      );
    }
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
          `[next-web-mcp] CONFIRM_TIMEOUT: "${toolName}" was not approved within 60 s and was denied.`,
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
