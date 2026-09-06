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

/** What `<ToolConfirmations/>` shows the user before a tool runs. */
export type ConfirmRequest = {
  /** e.g. "Start checkout" */
  title: string;
  /** One sentence. */
  description?: string;
  /** Rendered as a small table. */
  details?: Array<{ label: string; value: string }>;
};

/** Route-aware context handed to `execute(ctx)` and `confirm(input, ctx)`. */
export type ToolContext = {
  /** From `useParams()`, read when the tool runs. */
  params: ReturnType<typeof useParams>;
  /** From `usePathname()`, read when the tool runs. */
  pathname: string;
  /** Read lazily from `window.location.search` when the tool runs. */
  searchParams: URLSearchParams;
  /** From `useRouter()` (`next/navigation`). */
  router: AppRouterInstance;
  /**
   * Ask the user for approval; resolves `false` on deny, 60 s timeout or abort.
   * Rejects with a `NextWebMCPError` (code `CONFIRM_NO_RENDERER`) when no `<ToolConfirmations/>`
   * is mounted (nothing could show the card), so a tool never hangs waiting for an answer.
   */
  confirm: (req: ConfirmRequest, signal?: AbortSignal) => Promise<boolean>;
};

/** Options passed to the tool executor. */
export type ToolExecuteOptions = { signal: AbortSignal };

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
 * the JSON Schema of `input` and `annotations`. `execute` and `confirm` are read from the latest
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
  /** `true` → generic confirmation; function → custom card contents. */
  readonly confirm?: boolean | ((input: z.infer<TInput>, ctx: ToolContext) => ConfirmRequest);
  readonly execute: (
    ctx: ToolContext,
  ) => (input: z.infer<TInput>, opts: ToolExecuteOptions) => Promise<string | object>;
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
