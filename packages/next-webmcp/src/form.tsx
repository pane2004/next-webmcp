"use client";

import { useEffect, useState, type FormEvent } from "react";
import NextForm, { type FormProps } from "next/form";

/** Props for the WebMCP-aware {@link Form}. `action` may return a value; it is passed to `respond`. */
export type ToolFormProps = Omit<FormProps, "action"> & {
  /** A URL to navigate to, or a (server) action that receives the form data. Its return value feeds `respond`. */
  action: string | ((formData: FormData) => unknown);
  /** Tool name exposed to agents (`toolname` attribute). */
  toolname: string;
  /** What the form does, for agents (`tooldescription` attribute). */
  tooldescription: string;
  /** Let the agent submit without a click (`toolautosubmit` attribute). */
  toolautosubmit?: boolean;
  /** Maps the server action's return value to the string handed to `e.respondWith()`. Default: `String(result ?? "Done")`. */
  respond?: (result: unknown) => string;
};

/** The extra fields Chrome adds to `SubmitEvent` for agent-driven submissions. */
interface WebMCPSubmitEvent extends SubmitEvent {
  agentInvoked?: boolean;
  respondWith?: (response: Promise<unknown> | unknown) => void;
}

/** `toolactivated` / `toolcancel` window events. */
interface ToolActivationEvent extends Event {
  toolName?: string;
}

const defaultRespond = (result: unknown): string => String(result ?? "Done");

/**
 * `next/form`'s `Form` with WebMCP declarative-tool attributes. When an agent submits the form,
 * the server `action` runs with the form data and its result is handed back via `respondWith`.
 * Carries `data-tool-active` while an agent is filling it in.
 *
 * @example
 * ```tsx
 * import Form from "next-webmcp/form";
 * <Form action={subscribe} toolname="subscribe" tooldescription="Subscribe an email to the newsletter">
 *   <input name="email" type="email" toolparamdescription="Email address" />
 *   <button>Subscribe</button>
 * </Form>
 * ```
 * @see https://developer.chrome.com/docs/ai/webmcp#declarative
 */
export default function Form({
  toolname,
  tooldescription,
  toolautosubmit,
  respond,
  onSubmit,
  action,
  ...rest
}: ToolFormProps): React.JSX.Element {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const matches = (event: Event): boolean => (event as ToolActivationEvent).toolName === toolname;
    const onActivated = (event: Event): void => {
      if (matches(event)) setActive(true);
    };
    const onCancel = (event: Event): void => {
      if (matches(event)) setActive(false);
    };
    window.addEventListener("toolactivated", onActivated);
    window.addEventListener("toolcancel", onCancel);
    return () => {
      window.removeEventListener("toolactivated", onActivated);
      window.removeEventListener("toolcancel", onCancel);
    };
  }, [toolname]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    const native = event.nativeEvent as WebMCPSubmitEvent;
    if (
      native.agentInvoked !== true ||
      typeof action !== "function" ||
      typeof native.respondWith !== "function"
    ) {
      return; // human submit, or string action → native/next handling
    }
    event.preventDefault();
    setActive(false);
    const formData = new FormData(event.currentTarget);
    const map = respond ?? defaultRespond;
    native.respondWith(
      Promise.resolve()
        .then(() => action(formData))
        .then(
          map,
          (err: unknown) =>
            `${toolname} failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
    );
  };

  const toolAttributes: Record<string, string | undefined> = {
    toolname,
    tooldescription,
    toolautosubmit: toolautosubmit ? "" : undefined,
  };

  return (
    <NextForm
      {...rest}
      {...toolAttributes}
      action={action as FormProps["action"]}
      onSubmit={handleSubmit}
      data-tool-active={active ? "" : undefined}
    />
  );
}
