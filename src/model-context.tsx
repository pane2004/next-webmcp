"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { NextWebMCPError, errorMessage, isDev, warnOnce } from "./errors";
import { getModelContext } from "./native";
import { nextId, registry } from "./registry";
import { formatZodIssues, toolInputToJsonSchema } from "./schema";
import { TOOL_NAME_PATTERN } from "./tool";
import type { AppRouterInstance, ToolContext, ToolDef } from "./types";

/** Props for {@link ModelContext}. */
export type ModelContextProps = {
  /** Tools to expose while this component is mounted. */
  tools: ToolDef[];
  children?: ReactNode;
};

type RunOptions = {
  def: ToolDef;
  name: string;
  route: string;
  raw: unknown;
  signal: AbortSignal;
  ctx: ToolContext;
};

/** Runs one tool call: validate → execute → log. */
async function runTool({ def, name, route, raw, signal, ctx }: RunOptions): Promise<string> {
  const startedAt = Date.now();
  let ok = true;
  let output: string;
  try {
    // Async so a schema shared with a toolAction() may carry async refinements.
    const parsed = await def.input.safeParseAsync(raw);
    if (!parsed.success) {
      ok = false;
      output = `Invalid input for ${name}: ${formatZodIssues(parsed.error.issues)}. Fix the arguments and call again.`;
    } else {
      const result = await def.execute(ctx)(parsed.data, { signal });
      output = typeof result === "string" ? result : (JSON.stringify(result) ?? String(result));
    }
  } catch (err) {
    ok = false;
    const message = errorMessage(err).replace(/\.$/, "");
    output = `${name} failed: ${message}. Check the page state and try again.`;
  }
  registry.recordCall({
    id: nextId(),
    name,
    route,
    args: raw,
    startedAt,
    durationMs: Date.now() - startedAt,
    result: output,
    ok,
  });
  return output;
}

/**
 * What a native `execute` call reads at call time (never at registration time), so a tool
 * registered once keeps seeing the current route and the current `execute` closure.
 */
type Latest = {
  /** First definition per name in the current `tools` prop. */
  readonly defsByName: ReadonlyMap<string, ToolDef>;
  readonly pathname: string;
  readonly params: ReturnType<typeof useParams>;
  readonly router: AppRouterInstance;
};

/** One live `document.modelContext.registerTool()` call owned by a `<ModelContext>` instance. */
type Registration = {
  /** {@link toolKey} of the definition that was registered. */
  readonly key: string;
  /** Aborting this signal unregisters exactly this tool. */
  readonly controller: AbortController;
  /** Drops the registry entry that backs DevTools route attribution. */
  readonly unregister: () => void;
};

const EMPTY_DEFS: ReadonlyMap<string, ToolDef> = new Map();

/**
 * Identity of a tool as the browser sees it: everything `registerTool` receives except `execute`.
 * Two definitions with equal keys share one registration; `execute` is looked up
 * from the latest definition on every call, so a new factory result (say, one closing over a
 * different product) never re-registers.
 */
function toolKey(def: ToolDef, name: string, inputSchema: object): string {
  return JSON.stringify({
    name,
    title: def.title,
    description: def.description,
    inputSchema,
    annotations: def.annotations,
  });
}

/** First definition wins for duplicate names, matching the registration order below. */
function indexByName(tools: ToolDef[]): ReadonlyMap<string, ToolDef> {
  const map = new Map<string, ToolDef>();
  for (const def of tools) if (def.name !== undefined && !map.has(def.name)) map.set(def.name, def);
  return map;
}

function release(registration: Registration): void {
  registration.controller.abort();
  registration.unregister();
}

/**
 * Registers `tools` on `document.modelContext` while mounted, scoped to the current route.
 *
 * Each tool is registered by a stable key (`name`, `title`, `description`, JSON `inputSchema`,
 * `annotations`) with its own `AbortController`: a new `tools` array with the same keys is a
 * no-op, a tool whose key changed is re-registered on its own, tools that disappear are
 * aborted, and unmount aborts everything. `execute`, `pathname`, `params` and `router` are read
 * from the latest render on every call, so navigation never re-registers. Renders its children.
 * Safe when WebMCP is unavailable (logs once, no-op).
 *
 * @example
 * ```tsx
 * // app/products/[id]/tools.tsx
 * "use client";
 * export function ProductTools({ children }) {
 *   return <ModelContext tools={productTools}>{children}</ModelContext>;
 * }
 * ```
 * @see https://github.com/pane2004/next-webmcp#modelcontext
 */
export function ModelContext({ tools, children }: ModelContextProps): React.JSX.Element {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  // Written only inside effects (React Compiler safe). The sync effect below runs before the
  // registration effect in every commit, so no registered tool ever reads the initial value.
  const latest = useRef<Latest>({ defsByName: EMPTY_DEFS, pathname, params, router });
  const registrations = useRef(new Map<string, Registration>());

  // 1. Latest closure. Declared first so (re)registrations and native execute calls in the same
  //    commit see this render's route and definitions.
  useEffect(() => {
    latest.current = {
      defsByName: indexByName(tools),
      pathname,
      params,
      router,
    };
  }, [tools, pathname, params, router]);

  // 2. Register by stable key: diff `tools` against what this instance already registered.
  useEffect(() => {
    const mc = getModelContext();
    if (!mc) {
      warnOnce(
        "MODEL_CONTEXT_UNAVAILABLE",
        "[nextjs-webmcp] document.modelContext is unavailable in this browser; tools will not be registered. Enable WebMCP in Chrome 149+ (chrome://flags/#enable-webmcp-testing) or use Chrome Canary.",
        "info",
      );
      return;
    }
    const live = registrations.current;
    const route = latest.current.pathname;
    const seen = new Set<string>();
    const keep = new Set<string>();

    for (const def of tools) {
      const name = def.name;
      if (!name || !TOOL_NAME_PATTERN.test(name)) {
        warnOnce(
          `TOOL_NAME_INVALID:${String(name)}`,
          `[nextjs-webmcp] TOOL_NAME_INVALID: tool ${name ? `"${name}"` : "without a name"} was skipped. Use defineTools() or set a valid name.`,
        );
        continue;
      }
      if (seen.has(name)) {
        warnOnce(
          `TOOL_NAME_DUPLICATE:${name}`,
          `[nextjs-webmcp] TOOL_NAME_DUPLICATE: tool "${name}" appears twice in the same <ModelContext>.`,
        );
        continue;
      }
      seen.add(name);

      let inputSchema: object;
      try {
        inputSchema = toolInputToJsonSchema(def.input);
      } catch (err) {
        warnOnce(
          `SCHEMA:${name}`,
          `[nextjs-webmcp] Could not convert input schema for "${name}": ${errorMessage(err)}`,
        );
        continue;
      }

      const key = toolKey(def, name, inputSchema);
      const existing = live.get(name);
      if (existing !== undefined && existing.key === key) {
        keep.add(name);
        continue;
      }
      if (existing !== undefined) {
        release(existing);
        live.delete(name);
      }

      const controller = new AbortController();
      const native: WebMCP.ModelContextTool = {
        name,
        description: def.description,
        inputSchema,
        title: def.title,
        annotations: def.annotations,
        // Chrome 150 calls execute(input) with a single argument (no options object), so the
        // per-call signal is optional in practice even though the spec always provides it.
        execute: (raw, options?: { signal?: AbortSignal }) => {
          const execSignal = options?.signal instanceof AbortSignal ? options.signal : undefined;
          const signal = AbortSignal.any(
            execSignal ? [execSignal, controller.signal] : [controller.signal],
          );
          // Read at call time: the newest closure for this name, and the current route.
          const current = latest.current;
          const ctx: ToolContext = {
            params: current.params,
            pathname: current.pathname,
            searchParams: new URLSearchParams(
              typeof window === "undefined" ? "" : window.location.search,
            ),
            router: current.router,
          };
          return runTool({
            def: current.defsByName.get(name) ?? def,
            name,
            route: current.pathname,
            raw,
            signal,
            ctx,
          });
        },
      };

      // Spec call: document.modelContext.registerTool(tool, { signal }). Aborting `signal`
      // unregisters this one tool.
      // Chrome 150 returns undefined here (the spec and webmcp-types say Promise<void>), so
      // normalise with Promise.resolve and never let a registration failure unmount the tree.
      const onRegisterError = (err: unknown): void => {
        if (isDev())
          console.warn(`[nextjs-webmcp] registerTool("${name}") failed: ${errorMessage(err)}`);
      };
      try {
        void Promise.resolve(mc.registerTool(native, { signal: controller.signal })).catch(
          onRegisterError,
        );
      } catch (err) {
        onRegisterError(err);
        continue;
      }
      live.set(name, {
        key,
        controller,
        unregister: registry.registerTool(name, {
          route,
          title: def.title,
          description: def.description,
          inputSchema,
          annotations: def.annotations,
        }),
      });
      keep.add(name);
    }

    // Names registered earlier but gone (or no longer registrable) now.
    for (const [name, registration] of live) {
      if (keep.has(name)) continue;
      release(registration);
      live.delete(name);
    }
  }, [tools]);

  // 3. Route attribution (DevTools grouping) follows navigation without touching the browser.
  useEffect(() => {
    for (const name of registrations.current.keys()) registry.updateToolRoute(name, pathname);
  }, [pathname]);

  // 4. Unmount aborts every tool this instance owns. Kept separate from the registration effect
  //    so a `tools` change never tears down unchanged siblings.
  useEffect(() => {
    const live = registrations.current;
    return () => {
      for (const registration of live.values()) release(registration);
      live.clear();
    };
  }, []);

  return <>{children}</>;
}
