import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ModelContext, tool } from "../src/index";
import { WebMCPDevTools } from "../src/devtools";
import { __resetForTests } from "../src/internal";
import { installFakeModelContext, uninstallFakeModelContext } from "./fake-model-context";
import { resetNav } from "./mock-navigation";

beforeEach(() => {
  installFakeModelContext();
  resetNav();
});
afterEach(() => {
  cleanup();
  __resetForTests();
  uninstallFakeModelContext();
});

const greet = tool({
  name: "greet",
  description: "greet someone",
  input: z.object({ who: z.string().describe("Name"), loud: z.boolean().optional() }),
  execute: async ({ who }) => `hi ${who}`,
});

describe("WebMCPDevTools", () => {
  it("toggles open, lists tools by route and runs a tool", async () => {
    await act(async () => {
      render(
        <ModelContext tools={[greet]}>
          <WebMCPDevTools />
        </ModelContext>,
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open WebMCP DevTools" }));
    });
    expect(screen.getByRole("region", { name: "WebMCP DevTools" }).textContent).toContain("greet");
    expect(screen.getByRole("region").textContent).toContain("/");
    fireEvent.click(screen.getByRole("tab", { name: "Run" }));
    fireEvent.change(screen.getByLabelText("JSON args"), {
      target: { value: JSON.stringify({ who: "bob" }) },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
    });
    expect(screen.getByRole("tabpanel").textContent).toContain("hi bob");
    fireEvent.click(screen.getByRole("tab", { name: "Calls" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("greet");
  });
});
