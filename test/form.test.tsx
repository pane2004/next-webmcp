import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Form from "../src/form";

afterEach(() => cleanup());

function agentSubmit(form: HTMLFormElement): {
  event: SubmitEvent;
  respondWith: ReturnType<typeof vi.fn>;
} {
  const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
  const respondWith = vi.fn();
  Object.assign(event, { agentInvoked: true, respondWith });
  form.dispatchEvent(event);
  return { event, respondWith };
}

describe("nextjs-webmcp/form", () => {
  it("spreads the WebMCP attributes onto the form element", () => {
    const { container } = render(
      <Form action={async () => {}} toolname="subscribe" tooldescription="Subscribe" toolautosubmit>
        <input name="email" defaultValue="a@b.c" />
      </Form>,
    );
    const form = container.querySelector("form")!;
    expect(form.getAttribute("toolname")).toBe("subscribe");
    expect(form.getAttribute("tooldescription")).toBe("Subscribe");
    expect(form.hasAttribute("toolautosubmit")).toBe(true);
    expect(form.hasAttribute("data-tool-active")).toBe(false);
  });

  it("runs the action with FormData and responds via respondWith on agent submit", async () => {
    const action = vi.fn(async (data: FormData) => `hello ${String(data.get("email"))}`);
    const { container } = render(
      <Form
        action={action}
        toolname="subscribe"
        tooldescription="Subscribe"
        respond={(r) => `mapped: ${String(r)}`}
      >
        <input name="email" defaultValue="a@b.c" />
      </Form>,
    );
    const form = container.querySelector("form")!;
    let result: { event: SubmitEvent; respondWith: ReturnType<typeof vi.fn> } | undefined;
    await act(async () => {
      result = agentSubmit(form);
    });
    expect(result!.event.defaultPrevented).toBe(true);
    expect(result!.respondWith).toHaveBeenCalledTimes(1);
    await expect(result!.respondWith.mock.calls[0]?.[0]).resolves.toBe("mapped: hello a@b.c");
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0]?.[0]).toBeInstanceOf(FormData);
  });

  it("passes a Promise<string> action result straight to respondWith by default", async () => {
    async function subscribe(data: FormData): Promise<string> {
      return `Subscribed ${String(data.get("email"))}`;
    }
    const { container } = render(
      <Form action={subscribe} toolname="subscribe" tooldescription="Subscribe">
        <input name="email" defaultValue="a@b.c" toolparamdescription="Email address" />
      </Form>,
    );
    const form = container.querySelector("form")!;
    expect(form.querySelector("input")!.getAttribute("toolparamdescription")).toBe("Email address");
    let result: { event: SubmitEvent; respondWith: ReturnType<typeof vi.fn> } | undefined;
    await act(async () => {
      result = agentSubmit(form);
    });
    expect(result!.event.defaultPrevented).toBe(true);
    await expect(result!.respondWith.mock.calls[0]?.[0]).resolves.toBe("Subscribed a@b.c");
  });

  it("infers the respond argument type from the action's return value", async () => {
    // Type-level check: `r` is inferred as string (no cast, no annotation), so `.toUpperCase()` compiles.
    const { container } = render(
      <Form
        action={async () => "done"}
        respond={(r) => r.toUpperCase()}
        toolname="typed"
        tooldescription="Typed"
      />,
    );
    let result: { event: SubmitEvent; respondWith: ReturnType<typeof vi.fn> } | undefined;
    await act(async () => {
      result = agentSubmit(container.querySelector("form")!);
    });
    await expect(result!.respondWith.mock.calls[0]?.[0]).resolves.toBe("DONE");
  });

  it("tracks data-tool-active between toolactivated and toolcancel", async () => {
    const { container } = render(
      <Form action={async () => {}} toolname="t1" tooldescription="T" />,
    );
    const form = container.querySelector("form")!;
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("toolactivated"), { toolName: "t1" }));
    });
    expect(form.hasAttribute("data-tool-active")).toBe(true);
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("toolcancel"), { toolName: "t1" }));
    });
    expect(form.hasAttribute("data-tool-active")).toBe(false);
  });
});
