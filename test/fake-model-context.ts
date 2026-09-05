/**
 * A minimal in-memory `document.modelContext` for tests:
 * registerTool with signal-based unregister, alphabetized getTools, executeTool, `toolchange` events.
 */
export class FakeModelContext extends EventTarget {
  readonly tools = new Map<string, WebMCP.ModelContextTool>();
  registerCalls = 0;
  /** Mimic Chrome 150: getTools() returns inputSchema as a JSON string and omits annotations. */
  chrome150Shape = false;
  /** Every registerTool call in order, so tests can count registrations and aborts per name. */
  readonly registrations: Array<{
    name: string;
    tool: WebMCP.ModelContextTool;
    signal: AbortSignal | undefined;
  }> = [];
  ontoolchange: ((this: WebMCP.ModelContext, ev: Event) => unknown) | null = null;

  async registerTool(
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ): Promise<void> {
    if (options?.signal?.aborted) return;
    this.registerCalls += 1;
    this.registrations.push({ name: tool.name, tool, signal: options?.signal });
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener(
      "abort",
      () => {
        if (this.tools.get(tool.name) === tool) {
          this.tools.delete(tool.name);
          this.dispatchEvent(new Event("toolchange"));
        }
      },
      { once: true },
    );
    this.dispatchEvent(new Event("toolchange"));
  }

  /** Number of registerTool calls for `name`. */
  registerCallsFor(name: string): number {
    return this.registrations.filter((r) => r.name === name).length;
  }

  /** Signals of every registration for `name`, oldest first. */
  signalsFor(name: string): Array<AbortSignal | undefined> {
    return this.registrations.filter((r) => r.name === name).map((r) => r.signal);
  }

  async getTools(): Promise<WebMCP.RegisteredTool[]> {
    return [...this.tools.values()]
      .map((t) => {
        const info: WebMCP.RegisteredTool = {
          name: t.name,
          title: t.title ?? "",
          description: t.description,
          window,
          origin: window.location.origin,
        };
        if (t.inputSchema !== undefined) {
          info.inputSchema = this.chrome150Shape
            ? (JSON.stringify(t.inputSchema) as unknown as object)
            : (JSON.parse(JSON.stringify(t.inputSchema)) as object);
        }
        if (!this.chrome150Shape && t.annotations !== undefined) info.annotations = t.annotations;
        return info;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async executeTool(
    ref: string | { name: string },
    json: string,
    options?: { signal?: AbortSignal },
  ): Promise<unknown> {
    // Chrome accepts only the RegisteredTool object; the fake also accepts a name for convenience.
    const name = typeof ref === "string" ? ref : ref.name;
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`No tool named "${name}"`);
    const signal = options?.signal ?? new AbortController().signal;
    return tool.execute(JSON.parse(json) as Record<string, unknown>, { signal });
  }
}

/** Installs a fresh fake on `globalThis.document` and returns it. */
export function installFakeModelContext(): FakeModelContext {
  const fake = new FakeModelContext();
  Object.defineProperty(document, "modelContext", {
    value: fake,
    configurable: true,
    writable: true,
  });
  return fake;
}

/** Removes the fake so `document.modelContext` is undefined again. */
export function uninstallFakeModelContext(): void {
  Reflect.deleteProperty(document, "modelContext");
}
