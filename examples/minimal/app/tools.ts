import { z } from "zod";
import { defineTools, tool } from "next-webmcp";
import { addTodo } from "./actions";

/**
 * Tools exposed on every route of this app (mounted from app/providers.tsx).
 * Names default to the object keys.
 */
export const tools = defineTools({
  get_time: tool({
    description: "Return the current time in the user's browser as an ISO-8601 string.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    execute: () => async () => new Date().toISOString(),
  }),

  add_todo: tool({
    title: "Add todo",
    description: "Add a todo item to the list on this page. Asks the user to approve first.",
    input: z.object({
      text: z.string().min(1).max(200).describe("The todo text"),
    }),
    confirm: (input) => ({
      title: "Add todo",
      description: `Add "${input.text}" to your list?`,
    }),
    execute: (ctx) => async (input) => {
      const todo = await addTodo(input.text);
      // Refresh after returning so the agent receives the result even if the refresh re-renders the route.
      setTimeout(() => ctx.router.refresh(), 0);
      return `Added todo #${todo.id}: ${todo.text}`;
    },
  }),
});
