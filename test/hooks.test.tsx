import "./setup";
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

describe("isModelContextAvailable()", () => {
  it("reflects document.modelContext", () => {
    expect(isModelContextAvailable()).toBe(true);
    uninstallFakeModelContext();
    expect(isModelContextAvailable()).toBe(false);
  });
});
