import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ModelContext, tool, useToolCalls } from "../src/index";
import { __resetForTests, registry } from "../src/internal";
import {
  installFakeModelContext,
  uninstallFakeModelContext,
  type FakeModelContext,
} from "./fake-model-context";
import { nav, resetNav } from "./mock-navigation";

let fake: FakeModelContext;

beforeEach(() => {
  fake = installFakeModelContext();
  resetNav();
});
afterEach(() => {
  cleanup();
  __resetForTests();
  uninstallFakeModelContext();
  vi.restoreAllMocks();
});

const echo = tool({
  name: "echo",
  title: "Echo",
  description: "Echoes text",
  input: z.object({ text: z.string() }),
  execute:
    () =>
    async ({ text }) =>
      `echo: ${text}`,
});

const other = tool({
  name: "other",
  description: "Another tool",
  input: z.object({}),
  execute: () => async () => "other",
});

/** Signals that were aborted, across every registerTool call the fake has seen. */
function abortedSignals(): AbortSignal[] {
  return fake.registrations.flatMap((r) => (r.signal?.aborted ? [r.signal] : []));
}

describe("<ModelContext>", () => {
  it("renders only its children", () => {
    const { container } = render(
      <ModelContext tools={[echo]}>
        <p>page</p>
      </ModelContext>,
    );
    expect(container.innerHTML).toBe("<p>page</p>");
  });

  it("registers on mount and aborts (unregisters) every tool on unmount", () => {
    const { unmount } = render(<ModelContext tools={[echo, other]} />);
    expect(fake.tools.has("echo")).toBe(true);
    expect(fake.tools.has("other")).toBe(true);
    expect(registry.getState().tools["echo"]?.route).toBe("/");
    expect(abortedSignals()).toHaveLength(0);
    unmount();
    expect(fake.tools.size).toBe(0);
    expect(abortedSignals()).toHaveLength(2);
    expect(registry.getState().tools).toEqual({});
  });

  it("passes title, description, annotations and JSON schema to the browser", () => {
    const annotated = tool({
      name: "ro",
      title: "Read only",
      description: "Reads",
      input: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true },
      execute: () => async () => "ok",
    });
    render(<ModelContext tools={[annotated]} />);
    const native = fake.tools.get("ro");
    expect(native?.title).toBe("Read only");
    expect(native?.annotations).toEqual({ readOnlyHint: true });
    expect(native?.inputSchema).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(native?.inputSchema).not.toHaveProperty("$schema");
  });

  it("StrictMode ends with exactly one live registration per tool", async () => {
    render(
      <StrictMode>
        <ModelContext tools={[echo, other]} />
      </StrictMode>,
    );
    expect(fake.registerCalls).toBeGreaterThanOrEqual(4);
    expect(fake.tools.size).toBe(2);
    expect(Object.keys(registry.getState().tools).sort()).toEqual(["echo", "other"]);
    // Every registration except the live one per tool was aborted by the simulated unmount.
    expect(abortedSignals()).toHaveLength(fake.registerCalls - 2);
    await expect(fake.executeTool("echo", JSON.stringify({ text: "hi" }))).resolves.toBe(
      "echo: hi",
    );
  });

  it("nested ModelContexts coexist and duplicate names warn once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = tool({
      name: "a",
      description: "A",
      input: z.object({}),
      execute: () => async () => "a",
    });
    const b = tool({
      name: "b",
      description: "B",
      input: z.object({}),
      execute: () => async () => "b",
    });
    const dup1 = tool({
      name: "dup",
      description: "outer",
      input: z.object({}),
      execute: () => async () => "outer",
    });
    const dup2 = tool({
      name: "dup",
      description: "inner",
      input: z.object({}),
      execute: () => async () => "inner",
    });
    render(
      <ModelContext tools={[a, dup1]}>
        <ModelContext tools={[b, dup2]} />
      </ModelContext>,
    );
    expect([...fake.tools.keys()].sort()).toEqual(["a", "b", "dup"]);
    const dupWarnings = warn.mock.calls.filter((c) => String(c[0]).includes("TOOL_NAME_DUPLICATE"));
    expect(dupWarnings).toHaveLength(1);
  });

  describe("name collisions across nested instances", () => {
    const dupOuter = tool({
      name: "dup",
      description: "outer",
      input: z.object({}),
      execute: () => async () => "outer",
    });
    const dupInner = tool({
      ...dupOuter,
      description: "inner",
      execute: () => async () => "inner",
    });

    it("the outer instance wins when both mount in the same commit (child effects run first)", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      render(
        <ModelContext tools={[dupOuter]}>
          <ModelContext tools={[dupInner]} />
        </ModelContext>,
      );
      expect(fake.registrations.map((r) => r.tool.description)).toEqual(["inner", "outer"]);
      expect(fake.tools.get("dup")?.description).toBe("outer");
      expect(registry.getState().tools["dup"]?.description).toBe("outer");
      await expect(fake.executeTool("dup", "{}")).resolves.toBe("outer");
    });

    it("an inner instance mounted in a later commit wins without re-registering the outer one", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { rerender } = render(<ModelContext tools={[dupOuter]} />);
      await expect(fake.executeTool("dup", "{}")).resolves.toBe("outer");

      rerender(
        <ModelContext tools={[dupOuter]}>
          <ModelContext tools={[dupInner]} />
        </ModelContext>,
      );
      expect(fake.registrations.map((r) => r.tool.description)).toEqual(["outer", "inner"]);
      expect(fake.tools.get("dup")?.description).toBe("inner");
      expect(registry.getState().tools["dup"]?.description).toBe("inner");
      await expect(fake.executeTool("dup", "{}")).resolves.toBe("inner");
    });
  });

  describe("registration by stable key", () => {
    it("keeps registrations when the same tools arrive as a new array", () => {
      const { rerender } = render(<ModelContext tools={[echo, other]} />);
      const nativeEcho = fake.tools.get("echo");
      expect(fake.registerCalls).toBe(2);
      rerender(<ModelContext tools={[echo, other]} />);
      rerender(<ModelContext tools={[echo, other]} />);
      expect(fake.registerCalls).toBe(2);
      expect(fake.tools.get("echo")).toBe(nativeEcho);
      expect(abortedSignals()).toHaveLength(0);
    });

    it("keeps the registration but runs with a fresh ctx when pathname and params change", async () => {
      const whoami = tool({
        name: "whoami",
        description: "Returns the route id",
        input: z.object({}),
        execute: (ctx) => async () => `${ctx.pathname}:${String(ctx.params["id"])}`,
      });
      nav.params = { id: "1" };
      nav.pathname = "/items/1";
      const { rerender } = render(<ModelContext tools={[whoami]} />);
      await expect(fake.executeTool("whoami", "{}")).resolves.toBe("/items/1:1");
      expect(registry.getState().calls[0]?.route).toBe("/items/1");

      nav.params = { id: "2" };
      nav.pathname = "/items/2";
      rerender(<ModelContext tools={[whoami]} />);
      expect(fake.registerCalls).toBe(1);
      expect(fake.tools.size).toBe(1);
      expect(abortedSignals()).toHaveLength(0);
      await expect(fake.executeTool("whoami", "{}")).resolves.toBe("/items/2:2");
      expect(registry.getState().calls[0]?.route).toBe("/items/2");
      expect(registry.getState().tools["whoami"]?.route).toBe("/items/2");
    });

    it("re-registers only the tool whose description changed", () => {
      const a1 = tool({
        name: "a",
        description: "A",
        input: z.object({}),
        execute: () => async () => "a",
      });
      const a2 = tool({ ...a1, description: "A (changed)" });
      const { rerender } = render(<ModelContext tools={[a1, other]} />);
      const nativeOther = fake.tools.get("other");
      const [firstA] = fake.signalsFor("a");

      rerender(<ModelContext tools={[a2, other]} />);
      expect(fake.registerCallsFor("a")).toBe(2);
      expect(fake.registerCallsFor("other")).toBe(1);
      expect(fake.registerCalls).toBe(3);
      expect(abortedSignals()).toEqual([firstA]);
      expect(fake.signalsFor("other")[0]?.aborted).toBe(false);
      expect(fake.tools.get("other")).toBe(nativeOther);
      expect(fake.tools.get("a")?.description).toBe("A (changed)");
      expect(registry.getState().tools["a"]?.description).toBe("A (changed)");
    });

    it("re-registers a tool whose input schema changed", () => {
      const v1 = tool({
        name: "s",
        description: "S",
        input: z.object({ q: z.string() }),
        execute: () => async () => "",
      });
      const v2 = tool({ ...v1, input: z.object({ q: z.string(), limit: z.number() }) });
      const { rerender } = render(<ModelContext tools={[v1]} />);
      rerender(<ModelContext tools={[v2]} />);
      expect(fake.registerCallsFor("s")).toBe(2);
      expect(fake.tools.get("s")?.inputSchema).toMatchObject({
        properties: { q: { type: "string" }, limit: { type: "number" } },
      });
    });

    it("aborts a removed tool and leaves the others alone", () => {
      const { rerender } = render(<ModelContext tools={[echo, other]} />);
      const [otherSignal] = fake.signalsFor("other");
      rerender(<ModelContext tools={[echo]} />);
      expect(fake.tools.has("other")).toBe(false);
      expect(fake.tools.has("echo")).toBe(true);
      expect(abortedSignals()).toEqual([otherSignal]);
      expect(fake.registerCalls).toBe(2);
      expect(registry.getState().tools["other"]).toBeUndefined();
      expect(registry.getState().tools["echo"]?.route).toBe("/");
    });

    it("registers an added tool once without touching the existing ones", () => {
      const { rerender } = render(<ModelContext tools={[echo]} />);
      const nativeEcho = fake.tools.get("echo");
      rerender(<ModelContext tools={[echo, other]} />);
      expect(fake.registerCalls).toBe(2);
      expect(fake.registerCallsFor("other")).toBe(1);
      expect(fake.tools.get("echo")).toBe(nativeEcho);
      expect(abortedSignals()).toHaveLength(0);
      expect(registry.getState().tools["other"]?.route).toBe("/");
    });

    it("runs the newest closure without re-registering when a factory rebuilds the tools", async () => {
      const makeTools = (product: string) => [
        tool({
          name: "buy",
          description: "Buy the product on this page",
          input: z.object({}),
          execute: () => async () => `bought ${product}`,
        }),
      ];
      const { rerender } = render(<ModelContext tools={makeTools("shoe")} />);
      await expect(fake.executeTool("buy", "{}")).resolves.toBe("bought shoe");
      rerender(<ModelContext tools={makeTools("hat")} />);
      expect(fake.registerCalls).toBe(1);
      expect(abortedSignals()).toHaveLength(0);
      await expect(fake.executeTool("buy", "{}")).resolves.toBe("bought hat");
    });

    it("updates DevTools route attribution on navigation without re-registering", () => {
      nav.pathname = "/a";
      const { rerender } = render(<ModelContext tools={[echo, other]} />);
      expect(registry.getState().tools["echo"]?.route).toBe("/a");
      const before = registry.getState();

      nav.pathname = "/b";
      rerender(<ModelContext tools={[echo, other]} />);
      expect(fake.registerCalls).toBe(2);
      expect(abortedSignals()).toHaveLength(0);
      expect(registry.getState()).not.toBe(before);
      expect(registry.getState().tools["echo"]?.route).toBe("/b");
      expect(registry.getState().tools["other"]?.route).toBe("/b");

      // Same pathname again → no new snapshot (no listener churn).
      const after = registry.getState();
      rerender(<ModelContext tools={[echo, other]} />);
      expect(registry.getState()).toBe(after);
    });
  });

  it("returns an 'Invalid input' string when validation fails", async () => {
    render(<ModelContext tools={[echo]} />);
    const out = await fake.executeTool("echo", JSON.stringify({ text: 42 }));
    expect(out).toMatch(/^Invalid input for echo: text: /);
    expect(out).toMatch(/Fix the arguments and call again\.$/);
    expect(registry.getState().calls[0]).toMatchObject({ name: "echo", ok: false, route: "/" });
  });

  it("parses asynchronously, so a schema with async refinements works in the browser too", async () => {
    const claim = tool({
      name: "claim",
      description: "Claims a handle",
      input: z.object({
        handle: z.string().refine(async (h) => h !== "taken", { message: "Handle is taken" }),
      }),
      execute:
        () =>
        async ({ handle }) =>
          `claimed ${handle}`,
    });
    render(<ModelContext tools={[claim]} />);
    await expect(fake.executeTool("claim", JSON.stringify({ handle: "free" }))).resolves.toBe(
      "claimed free",
    );
    await expect(fake.executeTool("claim", JSON.stringify({ handle: "taken" }))).resolves.toBe(
      "Invalid input for claim: handle: Handle is taken. Fix the arguments and call again.",
    );
    expect(registry.getState().calls[0]).toMatchObject({ name: "claim", ok: false });
  });

  it("JSON-stringifies object results", async () => {
    const obj = tool({
      name: "obj",
      description: "Object",
      input: z.object({}),
      execute: () => async () => ({ a: 1, b: [2] }),
    });
    render(<ModelContext tools={[obj]} />);
    await expect(fake.executeTool("obj", "{}")).resolves.toBe('{"a":1,"b":[2]}');
  });

  it("maps thrown errors to '<name> failed:' without a stack trace", async () => {
    const boom = tool({
      name: "boom",
      description: "Throws",
      input: z.object({}),
      execute: () => async () => {
        throw new Error("kaboom");
      },
    });
    render(<ModelContext tools={[boom]} />);
    const out = await fake.executeTool("boom", "{}");
    expect(out).toBe("boom failed: kaboom. Check the page state and try again.");
    expect(out).not.toContain("at ");
    expect(registry.getState().calls[0]?.ok).toBe(false);
  });

  it("logs calls newest-first through useToolCalls()", async () => {
    let seen: string[] = [];
    function Log(): null {
      seen = useToolCalls().map((c) => c.result);
      return null;
    }
    render(
      <ModelContext tools={[echo]}>
        <Log />
      </ModelContext>,
    );
    await act(async () => {
      await fake.executeTool("echo", JSON.stringify({ text: "1" }));
      await fake.executeTool("echo", JSON.stringify({ text: "2" }));
    });
    expect(seen).toEqual(["echo: 2", "echo: 1"]);
  });

  it("exposes searchParams lazily and the router", async () => {
    window.history.replaceState(null, "", "/?q=shoes");
    const search = tool({
      name: "search",
      description: "Search",
      input: z.object({}),
      execute: (ctx) => async () => {
        ctx.router.push("/results");
        return ctx.searchParams.get("q") ?? "";
      },
    });
    render(<ModelContext tools={[search]} />);
    await expect(fake.executeTool("search", "{}")).resolves.toBe("shoes");
    expect(nav.router.push).toHaveBeenCalledWith("/results");
    window.history.replaceState(null, "", "/");
  });

  it("logs once and never throws when document.modelContext is missing", () => {
    uninstallFakeModelContext();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => {
      render(<ModelContext tools={[echo]} />);
      render(<ModelContext tools={[echo]} />);
    }).not.toThrow();
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]?.[0])).toContain("document.modelContext is unavailable");
  });

  it("skips tools with invalid or missing names with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unnamed = { description: "no name", input: z.object({}), execute: () => async () => "" };
    render(<ModelContext tools={[unnamed, { ...unnamed, name: "bad name!" }]} />);
    expect(fake.tools.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
