/**
 * A minimal in-memory `document.modelContext` for tests:
 * registerTool with signal-based unregister, alphabetized getTools, executeTool, `toolchange` events.
 */
export class FakeModelContext extends EventTarget {
  readonly tools = new Map<string, WebMCP.ModelContextTool>();
  registerCalls = 0;
  ontoolchange: ((this: WebMCP.ModelContext, ev: Event) => unknown) | null = null;

  async registerTool(
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ): Promise<void> {
    if (options?.signal?.aborted) return;
    this.registerCalls += 1;
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
        if (t.inputSchema !== undefined)
          info.inputSchema = JSON.parse(JSON.stringify(t.inputSchema)) as object;
        if (t.annotations !== undefined) info.annotations = t.annotations;
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
