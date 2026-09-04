import "./setup";
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
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

describe("<ModelContext>", () => {
  it("renders only its children while no confirmation is pending", () => {
    const { container } = render(
      <ModelContext tools={[echo]}>
        <p>page</p>
      </ModelContext>,
    );
    expect(container.innerHTML).toBe("<p>page</p>");
    expect(registry.confirmationRendererCount()).toBe(1);
  });

  it("registers on mount and aborts (unregisters) on unmount", () => {
    const { unmount } = render(<ModelContext tools={[echo]} />);
    expect(fake.tools.has("echo")).toBe(true);
    expect(registry.getState().tools["echo"]?.route).toBe("/");
    unmount();
    expect(fake.tools.has("echo")).toBe(false);
    expect(registry.getState().tools["echo"]).toBeUndefined();
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
        <ModelContext tools={[echo]} />
      </StrictMode>,
    );
    expect(fake.registerCalls).toBeGreaterThanOrEqual(2);
    expect(fake.tools.size).toBe(1);
    expect(Object.keys(registry.getState().tools)).toEqual(["echo"]);
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

  it("re-registers with a fresh ctx when params change", async () => {
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
    nav.params = { id: "2" };
    nav.pathname = "/items/2";
    rerender(<ModelContext tools={[whoami]} />);
    expect(fake.tools.size).toBe(1);
    await expect(fake.executeTool("whoami", "{}")).resolves.toBe("/items/2:2");
    expect(registry.getState().tools["whoami"]?.route).toBe("/items/2");
  });

  it("returns an 'Invalid input' string when validation fails", async () => {
    render(<ModelContext tools={[echo]} />);
    const out = await fake.executeTool("echo", JSON.stringify({ text: 42 }));
    expect(out).toMatch(/^Invalid input for echo: text: /);
    expect(out).toMatch(/Fix the arguments and call again\.$/);
    expect(registry.getState().calls[0]).toMatchObject({ name: "echo", ok: false, route: "/" });
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
