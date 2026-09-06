import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ModelContext,
  isModelContextAvailable,
  tool,
  useModelContextTools,
  type RegisteredToolInfo,
} from "../src/index";
import { __resetForTests } from "../src/internal";
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
});

describe("useModelContextTools()", () => {
  it.each([
    ["is missing", undefined],
    [
      "throws",
      () => {
        throw new Error("no tools");
      },
    ],
  ] as const)(
    "returns an empty list instead of crashing when getTools %s",
    async (_label, impl) => {
      Object.defineProperty(fake, "getTools", { value: impl, configurable: true });
      let seen: RegisteredToolInfo[] = [];
      function Probe(): null {
        seen = useModelContextTools();
        return null;
      }
      const t = tool({
        name: "bridge_tool",
        description: "Available through a browser bridge",
        input: z.object({}),
        execute: () => async () => "ok",
      });
      await act(async () => {
        render(
          <ModelContext tools={[t]}>
            <Probe />
          </ModelContext>,
        );
      });
      expect(seen).toEqual([]);
      expect(fake.tools.has("bridge_tool")).toBe(true);
    },
  );

  it("accepts a getTools that returns an array synchronously", async () => {
    Object.defineProperty(fake, "getTools", {
      value: () =>
        [...fake.tools.values()].map((x) => ({ name: x.name, description: x.description })),
      configurable: true,
    });
    let seen: RegisteredToolInfo[] = [];
    function Probe(): null {
      seen = useModelContextTools();
      return null;
    }
    const t = tool({
      name: "bridge_tool",
      description: "Available through a browser bridge",
      input: z.object({}),
      execute: () => async () => "ok",
    });
    await act(async () => {
      render(
        <ModelContext tools={[t]}>
          <Probe />
        </ModelContext>,
      );
    });
    expect(seen.map((x) => x.name)).toEqual(["bridge_tool"]);
  });

  it.each(["addEventListener", "removeEventListener"])(
    "keeps registration and tool listing working without %s",
    async (method) => {
      Object.defineProperty(fake, method, { value: undefined, configurable: true });
      let seen: RegisteredToolInfo[] = [];
      function Probe(): null {
        seen = useModelContextTools();
        return null;
      }
      const t = tool({
        name: "bridge_tool",
        description: "Available through a browser bridge",
        input: z.object({}),
        execute: () => async () => "ok",
      });
      await act(async () => {
        render(
          <ModelContext tools={[t]}>
            <Probe />
          </ModelContext>,
        );
      });
      expect(seen.map((x) => x.name)).toEqual(["bridge_tool"]);
      expect((await fake.getTools()).map((x) => x.name)).toEqual(["bridge_tool"]);
      cleanup();
      expect(await fake.getTools()).toEqual([]);
    },
  );

  it("lists live tools merged with registry routes and follows toolchange", async () => {
    let seen: RegisteredToolInfo[] = [];
    function Probe(): null {
      seen = useModelContextTools();
      return null;
    }
    nav.pathname = "/cart";
    const t = tool({
      name: "zeta",
      title: "Zeta",
      description: "Z",
      input: z.object({}),
      execute: () => async () => "",
    });
    await act(async () => {
      render(
        <ModelContext tools={[t]}>
          <Probe />
        </ModelContext>,
      );
    });
    // A tool we did not register (e.g. a declarative form) has no route.
    await act(async () => {
      await fake.registerTool({ name: "alpha", description: "A", execute: () => "" });
    });
    expect(seen.map((x) => x.name)).toEqual(["alpha", "zeta"]);
    expect(seen[1]).toMatchObject({ name: "zeta", title: "Zeta", route: "/cart" });
    expect(seen[0]?.route).toBeUndefined();
  });
});

describe("useModelContextTools() on Chrome 150", () => {
  it("returns object schemas and annotations when the browser hands back strings", async () => {
    fake.chrome150Shape = true;
    let seen: RegisteredToolInfo[] = [];
    function Probe(): null {
      seen = useModelContextTools();
      return null;
    }
    const ours = tool({
      name: "ours",
      description: "Ours",
      input: z.object({ q: z.string().describe("Query") }),
      annotations: { readOnlyHint: true },
      execute: () => async () => "",
    });
    await act(async () => {
      render(
        <ModelContext tools={[ours]}>
          <Probe />
        </ModelContext>,
      );
    });
    // A tool registered outside next-web-mcp (e.g. a declarative form): only the browser copy exists.
    await act(async () => {
      await fake.registerTool({
        name: "foreign",
        description: "F",
        inputSchema: { type: "object", properties: { email: { type: "string" } } },
        execute: () => "",
      });
    });
    const mine = seen.find((x) => x.name === "ours");
    const foreign = seen.find((x) => x.name === "foreign");
    expect(mine?.inputSchema).toMatchObject({
      type: "object",
      properties: { q: { type: "string", description: "Query" } },
    });
    expect(mine?.annotations).toEqual({ readOnlyHint: true });
    expect(mine?.route).toBeDefined();
    expect(foreign?.inputSchema).toEqual({
      type: "object",
      properties: { email: { type: "string" } },
    });
    expect(foreign?.annotations).toBeUndefined();
  });
});

describe("isModelContextAvailable()", () => {
  it("reflects document.modelContext", () => {
    expect(isModelContextAvailable()).toBe(true);
    uninstallFakeModelContext();
    expect(isModelContextAvailable()).toBe(false);
  });
});
