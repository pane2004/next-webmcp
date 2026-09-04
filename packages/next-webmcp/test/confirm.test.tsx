import "./setup";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ModelContext, ToolConfirmations, tool } from "../src/index";
import { __resetForTests, registry } from "../src/internal";
import {
  installFakeModelContext,
  uninstallFakeModelContext,
  type FakeModelContext,
} from "./fake-model-context";
import { resetNav } from "./mock-navigation";

let fake: FakeModelContext;

beforeEach(() => {
  fake = installFakeModelContext();
  resetNav();
});
afterEach(() => {
  cleanup();
  __resetForTests();
  uninstallFakeModelContext();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const checkout = tool({
  name: "checkout",
  title: "Start checkout",
  description: "Starts checkout",
  input: z.object({ total: z.number() }),
  confirm: true,
  execute:
    () =>
    async ({ total }) =>
      `paid ${total}`,
});

function mount(): void {
  render(
    <ModelContext tools={[checkout]}>
      <ToolConfirmations />
    </ModelContext>,
  );
}

/** Starts an agent call; returns a wrapper so the pending promise is not adopted by `async`. */
async function start(signal?: AbortSignal): Promise<{ promise: Promise<unknown> }> {
  let promise!: Promise<unknown>;
  await act(async () => {
    promise = fake.executeTool(
      "checkout",
      JSON.stringify({ total: 42 }),
      signal ? { signal } : undefined,
    );
  });
  return { promise };
}

describe("confirmations", () => {
  it("renders a dialog with the generic request and approves via the button", async () => {
    mount();
    const { promise } = await start();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-live")).toBe("polite");
    expect(dialog.textContent).toContain("Start checkout");
    expect(dialog.textContent).toContain("total");
    expect(dialog.textContent).toContain("42");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    });
    await expect(promise).resolves.toBe("paid 42");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(registry.getState().calls[0]?.ok).toBe(true);
  });

  it("denies via the button and via Escape; Enter approves", async () => {
    mount();
    const { promise: p1 } = await start();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    await expect(p1).resolves.toBe("User declined checkout.");

    const { promise: p2 } = await start();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("button", { name: "Approve" }), { key: "Escape" });
    });
    await expect(p2).resolves.toBe("User declined checkout.");

    const { promise: p3 } = await start();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Enter" });
    });
    await expect(p3).resolves.toBe("paid 42");
  });

  it("ignores Enter and Escape typed into inputs outside the card", async () => {
    render(
      <ModelContext tools={[checkout]}>
        <input aria-label="Search" />
        <ToolConfirmations />
      </ModelContext>,
    );
    const { promise } = await start();
    const outside = screen.getByLabelText("Search");
    const submit = fireEvent.keyDown(outside, { key: "Enter" });
    expect(submit).toBe(true); // not preventDefault()ed: the form would still submit
    await act(async () => {
      fireEvent.keyDown(outside, { key: "Escape" });
    });
    expect(registry.getState().confirmations).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(screen.getByRole("button", { name: "Approve" }), { key: "Enter" });
    });
    await expect(promise).resolves.toBe("paid 42");
  });

  it("uses a custom confirm() request", async () => {
    const custom = tool({
      name: "custom",
      description: "Custom",
      input: z.object({ n: z.number() }),
      confirm: (input, ctx) => ({
        title: `Do ${input.n} on ${ctx.pathname}`,
        description: "Sure?",
      }),
      execute: () => async () => "done",
    });
    render(
      <ModelContext tools={[custom]}>
        <ToolConfirmations />
      </ModelContext>,
    );
    await act(async () => {
      void fake.executeTool("custom", JSON.stringify({ n: 7 }));
    });
    expect(screen.getByRole("dialog").textContent).toContain("Do 7 on /");
    expect(screen.getByRole("dialog").textContent).toContain("Sure?");
  });

  it("denies when the execution signal is aborted", async () => {
    mount();
    const controller = new AbortController();
    const { promise } = await start(controller.signal);
    expect(registry.getState().confirmations).toHaveLength(1);
    await act(async () => {
      controller.abort();
    });
    await expect(promise).resolves.toBe("User declined checkout.");
    expect(registry.getState().confirmations).toHaveLength(0);
  });

  it("denies after the 60 s timeout", async () => {
    vi.useFakeTimers();
    mount();
    const { promise } = await start();
    expect(registry.getState().confirmations).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await expect(promise).resolves.toBe("User declined checkout.");
    expect(registry.getState().confirmations).toHaveLength(0);
  });

  it("denies pending confirmations when the ModelContext unmounts", async () => {
    const { unmount } = render(<ModelContext tools={[checkout]} />);
    const promise = fake.executeTool("checkout", JSON.stringify({ total: 1 }));
    expect(registry.getState().confirmations).toHaveLength(1);
    unmount();
    await expect(promise).resolves.toBe("User declined checkout.");
  });
});
