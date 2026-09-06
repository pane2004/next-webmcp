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

const noop = tool({
  name: "noop",
  description: "Does nothing",
  input: z.object({}),
  execute: () => async () => "noop",
});

const NO_RENDERER_RESULT =
  'checkout failed: [next-web-mcp] Tool "checkout" needs approval but no <ToolConfirmations/> is mounted. ' +
  "Keep the default confirmations on <ModelContext>, or mount <ToolConfirmations/> yourself. " +
  "Check the page state and try again.";

/** The outermost <ModelContext> renders <ToolConfirmations/> by default. */
function mount(): void {
  render(<ModelContext tools={[checkout]} />);
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
    render(<ModelContext tools={[custom]} />);
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
    let promise!: Promise<unknown>;
    await act(async () => {
      promise = fake.executeTool("checkout", JSON.stringify({ total: 1 }));
    });
    expect(registry.getState().confirmations).toHaveLength(1);
    unmount();
    await expect(promise).resolves.toBe("User declined checkout.");
  });
});

describe("confirmations rendering", () => {
  it("is rendered by the outermost ModelContext only (nested instances add no dialog)", async () => {
    render(
      <ModelContext tools={[noop]}>
        <ModelContext tools={[checkout]}>
          <span>page</span>
        </ModelContext>
      </ModelContext>,
    );
    expect(registry.confirmationRendererCount()).toBe(1);
    const { promise } = await start();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    });
    await expect(promise).resolves.toBe("paid 42");
  });

  it("confirmations={false} renders no dialog; a manual <ToolConfirmations/> still works", async () => {
    const { unmount } = render(<ModelContext tools={[noop]} confirmations={false} />);
    expect(registry.confirmationRendererCount()).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    render(
      <ModelContext tools={[checkout]} confirmations={false}>
        <ToolConfirmations />
      </ModelContext>,
    );
    expect(registry.confirmationRendererCount()).toBe(1);
    const { promise } = await start();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    await expect(promise).resolves.toBe("User declined checkout.");
  });

  it("fails immediately with CONFIRM_NO_RENDERER when nothing renders confirmations", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ModelContext tools={[checkout]} confirmations={false} />);
    const out = await fake.executeTool("checkout", JSON.stringify({ total: 42 }));
    expect(out).toBe(NO_RENDERER_RESULT);
    expect(registry.getState().confirmations).toHaveLength(0);
    expect(registry.getState().calls[0]).toMatchObject({ name: "checkout", ok: false });

    await expect(fake.executeTool("checkout", JSON.stringify({ total: 1 }))).resolves.toBe(
      NO_RENDERER_RESULT,
    );
    // Logged once per tool in dev, not once per call.
    const noRenderer = warn.mock.calls.filter((c) =>
      String(c[0]).includes("no <ToolConfirmations/> is mounted"),
    );
    expect(noRenderer).toHaveLength(1);
  });

  it("sibling ModelContexts and duplicate mounts show exactly one dialog", async () => {
    // Stable arrays, as in a real app: a new array identity would re-register (and abort) tools.
    const layoutTools = [noop];
    const pageTools = [checkout];
    const { rerender } = render(
      <>
        <ModelContext key="layout" tools={layoutTools} />
        <ModelContext key="page" tools={pageTools} />
        <ToolConfirmations />
      </>,
    );
    expect(registry.confirmationRendererCount()).toBe(3);
    const { promise } = await start();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // Unmounting the primary renderer hands the card to the next one; the request survives.
    rerender(
      <>
        <ModelContext key="page" tools={pageTools} />
        <ToolConfirmations />
      </>,
    );
    expect(registry.confirmationRendererCount()).toBe(2);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    });
    await expect(promise).resolves.toBe("paid 42");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
