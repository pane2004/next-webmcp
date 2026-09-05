import { z } from "zod";
import { defineTools, navigationTool, tool, unwrap } from "next-web-mcp";
import { addTodo } from "./actions";
import { todoInput } from "./todos";

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
    input: todoInput,
    confirm: (input) => ({
      title: "Add todo",
      description: `Add "${input.text}" to your list?`,
    }),
    execute: (ctx) => async (input) => {
      // The action validates again on the server; unwrap() throws its sentence if it failed.
      const todo = unwrap(await addTodo(input));
      // Refresh after returning so the agent receives the result even if the refresh re-renders the route.
      setTimeout(() => ctx.router.refresh(), 0);
      return `Added todo #${todo.id}: ${todo.text}`;
    },
  }),

  navigate_to: navigationTool({
    routes: [
      { path: "/", description: "The todo list." },
      {
        path: "/todos/[id]",
        description: "One todo, by the number shown in the list.",
        params: z.object({ id: z.string().regex(/^\d+$/, "Expected a todo number") }),
      },
    ],
  }),
});
