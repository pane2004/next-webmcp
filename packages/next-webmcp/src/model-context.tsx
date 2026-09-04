"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { errorMessage, isDev, warnOnce } from "./errors";
import { getModelContext } from "./native";
import { nextId, registry } from "./registry";
import { toolInputToJsonSchema } from "./schema";
import { TOOL_NAME_PATTERN } from "./tool";
import type { AppRouterInstance, ConfirmRequest, ToolContext, ToolDef } from "./types";

/** Props for {@link ModelContext}. */
export type ModelContextProps = {
  /** Tools to expose while this component is mounted. */
  tools: ToolDef[];
  children?: ReactNode;
};

/** Combines several signals into one (polyfill for `AbortSignal.any`). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

function toDisplayValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function defaultConfirmRequest(def: ToolDef, name: string, input: unknown): ConfirmRequest {
  const details =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? Object.entries(input as Record<string, unknown>).map(([label, value]) => ({
          label,
          value: toDisplayValue(value),
        }))
      : [{ label: "input", value: toDisplayValue(input) }];
  const request: ConfirmRequest = { title: def.title ?? name, details };
  if (def.description) request.description = def.description;
  return request;
}

function formatIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map(
      (issue) =>
        `${issue.path.length ? issue.path.map(String).join(".") : "(root)"}: ${issue.message}`,
    )
    .join("; ");
}

type RunOptions = {
  def: ToolDef;
  name: string;
  route: string;
  raw: unknown;
  signal: AbortSignal;
  ctx: ToolContext;
};

/** Runs one tool call with the semantics from the API contract (validate → confirm → execute → log). */
async function runTool({ def, name, route, raw, signal, ctx }: RunOptions): Promise<string> {
  const startedAt = Date.now();
  let ok = true;
  let output: string;
  try {
    const parsed = def.input.safeParse(raw);
    if (!parsed.success) {
      ok = false;
      output = `Invalid input for ${name}: ${formatIssues(parsed.error.issues)}. Fix the arguments and call again.`;
    } else {
      let approved = true;
      if (def.confirm) {
        const request =
          typeof def.confirm === "function"
            ? def.confirm(parsed.data, ctx)
            : defaultConfirmRequest(def, name, parsed.data);
        approved = await ctx.confirm(request, signal);
      }
      if (!approved) {
        ok = false;
        output = `User declined ${name}.`;
      } else {
        const result = await def.execute(ctx)(parsed.data, { signal });
        output = typeof result === "string" ? result : (JSON.stringify(result) ?? String(result));
      }
    }
  } catch (err) {
    ok = false;
    output = `${name} failed: ${errorMessage(err)}. Check the page state and try again.`;
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
 * Registers `tools` on `document.modelContext` while mounted, scoped to the current route.
 * Re-registers when `pathname` or route `params` change so `ctx` stays fresh; aborts on unmount.
 * Renders nothing but its children. Safe when WebMCP is unavailable (logs once, no-op).
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
  const routerRef = useRef<AppRouterInstance>(router);
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    const mc = getModelContext();
    if (!mc) {
      warnOnce(
        "MODEL_CONTEXT_UNAVAILABLE",
        "[next-webmcp] document.modelContext is unavailable in this browser; tools will not be registered. Enable WebMCP in Chrome 149+ (chrome://flags/#enable-webmcp-testing) or use Chrome Canary.",
        "info",
      );
      return;
    }
    const controller = new AbortController();
    const unregisters: Array<() => void> = [];
    const seen = new Set<string>();
    const route = pathname;
    const routeParams = (JSON.parse(paramsKey) as Record<string, string | string[]>) ?? {};

    for (const def of tools) {
      const name = def.name;
      if (!name || !TOOL_NAME_PATTERN.test(name)) {
        warnOnce(
          `TOOL_NAME_INVALID:${String(name)}`,
          `[next-webmcp] TOOL_NAME_INVALID: tool ${name ? `"${name}"` : "without a name"} was skipped. Use defineTools() or set a valid name.`,
        );
        continue;
      }
      if (seen.has(name)) {
        warnOnce(
          `TOOL_NAME_DUPLICATE:${name}`,
          `[next-webmcp] TOOL_NAME_DUPLICATE: tool "${name}" appears twice in the same <ModelContext>.`,
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
          `[next-webmcp] Could not convert input schema for "${name}": ${errorMessage(err)}`,
        );
        continue;
      }

      const buildContext = (signal: AbortSignal): ToolContext => ({
        params: routeParams,
        pathname: route,
        searchParams: new URLSearchParams(
          typeof window === "undefined" ? "" : window.location.search,
        ),
        router: routerRef.current,
        confirm: (request, confirmSignal) =>
          registry.requestConfirm(
            name,
            request,
            confirmSignal ? anySignal([confirmSignal, signal]) : signal,
          ),
      });

      const native: WebMCP.ModelContextTool = {
        name,
        description: def.description,
        inputSchema,
        execute: (raw, { signal: execSignal }) => {
          const signal = anySignal([execSignal, controller.signal]);
          return runTool({ def, name, route, raw, signal, ctx: buildContext(signal) });
        },
      };
      if (def.title !== undefined) native.title = def.title;
      if (def.annotations !== undefined) native.annotations = def.annotations;

      // Spec call: document.modelContext.registerTool(tool, { signal }). Aborting `signal`
      // on unmount unregisters every tool from this mount.
      // Chrome 150 returns undefined here (the spec and webmcp-types say Promise<void>), so
      // normalise with Promise.resolve and never let a registration failure unmount the tree.
      const onRegisterError = (err: unknown): void => {
        if (isDev())
          console.warn(`[next-webmcp] registerTool("${name}") failed: ${errorMessage(err)}`);
      };
      try {
        void Promise.resolve(mc.registerTool(native, { signal: controller.signal })).catch(
          onRegisterError,
        );
      } catch (err) {
        onRegisterError(err);
        continue;
      }
      const info: { route: string; description: string; title?: string } = {
        route,
        description: def.description,
      };
      if (def.title !== undefined) info.title = def.title;
      unregisters.push(registry.registerTool(name, info));
    }

    return () => {
      controller.abort();
      for (const unregister of unregisters) unregister();
    };
  }, [tools, pathname, paramsKey]);

  return <>{children}</>;
}
