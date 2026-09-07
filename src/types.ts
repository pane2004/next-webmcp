import type { z } from "zod";
import type { useParams, useRouter } from "next/navigation";

/** The App Router instance returned by `useRouter()` from `next/navigation`. */
export type AppRouterInstance = ReturnType<typeof useRouter>;

/**
 * Behavioral hints passed to the browser alongside a tool.
 * @see https://developer.chrome.com/docs/ai/webmcp
 */
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  /** Passed through verbatim for newer Chrome builds. */
  consequentialHint?: boolean;
};

/** Route-aware context handed to `execute(input, ctx)`. */
export type ToolContext = {
  /** From `useParams()`, read when the tool runs. */
  params: ReturnType<typeof useParams>;
  /** From `usePathname()`, read when the tool runs. */
  pathname: string;
  /** Read lazily from `window.location.search` when the tool runs. */
  searchParams: URLSearchParams;
  /** From `useRouter()` (`next/navigation`). */
  router: AppRouterInstance;
  /** Aborted when the browser cancels the call or the tool unregisters. */
  signal: AbortSignal;
};

/**
 * A Zod schema with its input/output erased so heterogeneous tools can share one array.
 * (`any` is used deliberately for variance erasure, mirroring Zod's own `ZodTypeAny`.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyZodSchema = z.ZodType<any, any>;

/**
 * A route-scoped tool definition. Create with {@link tool} for full inference.
 *
 * Inside `<ModelContext>` the browser registration is keyed by `name`, `title`, `description`,
 * the JSON Schema of `input` and `annotations`. `execute` is read from the latest
 * definition on every call, so rebuilding the `tools` array (or closing over new data) with the
 * same keys never re-registers anything.
 * @see https://github.com/pane2004/next-webmcp#tool
 */
export type ToolDef<TInput extends z.ZodTypeAny = AnyZodSchema> = {
  /** Defaults to the object key when used in `defineTools()`. */
  readonly name?: string;
  readonly title?: string;
  readonly description: string;
  /** Zod schema, converted to JSON Schema via `z.toJSONSchema` (Zod 4). */
  readonly input: TInput;
  readonly annotations?: ToolAnnotations;
  /**
   * Runs the validated call. Return a string for the agent, an object (sent as JSON), or the
   * `ToolActionResult` of a `toolAction()` server action, which is unwrapped for you: `data`
   * becomes the result and `error` becomes `<name> failed: <error>`.
   */
  readonly execute: (
    input: z.infer<TInput>,
    ctx: ToolContext,
  ) => Promise<string | object> | string | object;
};

/** One entry in the call log (`useToolCalls()`). */
export type ToolCallRecord = {
  id: string;
  name: string;
  route: string;
  args: unknown;
  startedAt: number;
  durationMs: number;
  result: string;
  ok: boolean;
};

/** A tool currently registered on `document.modelContext`, merged with our registry. */
export type RegisteredToolInfo = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  /** Pathname that registered it; `undefined` for tools we did not register (e.g. declarative forms). */
  route?: string;
};
