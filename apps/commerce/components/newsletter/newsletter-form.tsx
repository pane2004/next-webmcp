"use client";

import Form from "next-webmcp/form";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { subscribeToNewsletter } from "app/actions";

type FormAction = (formData: FormData) => Promise<void>;

declare module "react" {
  interface InputHTMLAttributes<T> {
    /** WebMCP declarative-form attribute: describes this field to the browser agent. */
    toolparamdescription?: string;
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Subscribing…" : "Subscribe"}
    </button>
  );
}

/**
 * Newsletter sign-up exposed as the declarative WebMCP tool
 * `subscribe_newsletter`: Chrome fills the email field and auto-submits, and
 * the server action's message is handed back to the agent and shown below.
 *
 * @example
 * <NewsletterForm />
 * @see app/actions.ts subscribeToNewsletter
 */
export function NewsletterForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function subscribe(formData: FormData): Promise<string> {
    const result = await subscribeToNewsletter(formData);
    setMessage(result);
    return result;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-black dark:text-white">Newsletter</p>
      <Form
        toolname="subscribe_newsletter"
        tooldescription="Subscribe an email address to the Acme newsletter."
        toolautosubmit
        // next/form types `action` as returning void; next-webmcp/form passes the
        // resolved value to e.respondWith() so the agent reads the server's message.
        action={subscribe as unknown as FormAction}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="sr-only" htmlFor="newsletter-email">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          toolparamdescription="Email address to subscribe"
          className="h-9 w-56 rounded-md border border-neutral-200 bg-white px-3 text-xs text-black placeholder:text-neutral-500 dark:border-neutral-700 dark:bg-black dark:text-white"
        />
        <SubmitButton />
      </Form>
      <p aria-live="polite" role="status" className="min-h-4 text-xs">
        {message}
      </p>
    </div>
  );
}
