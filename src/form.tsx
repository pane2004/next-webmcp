"use client";

import { useEffect, useState, type FormEvent } from "react";
import NextForm, { type FormProps } from "next/form";

/**
 * JSX typings for Chrome's declarative WebMCP form attributes, so `<form toolname=…>` and
 * `<input toolparamdescription=…>` type-check in any file once `nextjs-webmcp/form` is imported
 * anywhere in the project. Consumers never write this augmentation themselves.
 *
 * @see https://developer.chrome.com/docs/ai/webmcp#declarative
 */
declare module "react" {
  interface FormHTMLAttributes<T> {
    /** Tool name exposed to browser agents. */
    toolname?: string;
    /** What the form does, for browser agents. */
    tooldescription?: string;
    /**
     * Let the agent submit the form without a click. On a plain `<form>` write `toolautosubmit=""`:
     * React drops `true` for custom attributes, so the boolean form only works through `Form` from
     * `nextjs-webmcp/form`, which sets the attribute correctly.
     */
    toolautosubmit?: boolean | "";
  }
  interface InputHTMLAttributes<T> {
    /** Describes this field to the browser agent. */
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    /** Describes this field to the browser agent. */
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    /** Describes this field to the browser agent. */
    toolparamdescription?: string;
  }
}

/**
 * Props for the WebMCP-aware {@link Form}. `R` is inferred from what `action` returns and is the
 * value `respond` receives.
 *
 * @example
 * ```tsx
 * // R is inferred as string, so `respond` receives a string.
 * <Form action={async (fd: FormData) => "ok"} respond={(r) => r.toUpperCase()} toolname="t" tooldescription="…" />
 * ```
 */
export type ToolFormProps<R = unknown> = Omit<FormProps, "action"> & {
  /** A URL to navigate to, or a (server) action that receives the form data. Its return value feeds `respond`. */
  action: string | ((formData: FormData) => R | Promise<R>);
  /** Maps the action's resolved value to the string handed to `e.respondWith()`. Default: `String(result ?? "Done")`. */
  respond?: (result: R) => string;
  /** Tool name exposed to agents (`toolname` attribute). */
  toolname: string;
  /** What the form does, for agents (`tooldescription` attribute). */
  tooldescription: string;
  /** Let the agent submit without a click (`toolautosubmit` attribute). */
  toolautosubmit?: boolean;
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
 * import Form from "nextjs-webmcp/form";
 * <Form action={subscribe} toolname="subscribe" tooldescription="Subscribe an email to the newsletter">
 *   <input name="email" type="email" toolparamdescription="Email address" />
 *   <button>Subscribe</button>
 * </Form>
 * ```
 * @see https://developer.chrome.com/docs/ai/webmcp#declarative
 */
export default function Form<R = unknown>({
  toolname,
  tooldescription,
  toolautosubmit,
  respond,
  onSubmit,
  action,
  ...rest
}: ToolFormProps<R>): React.JSX.Element {
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
    const map: (result: R) => string = respond ?? defaultRespond;
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
