"use server";

import { revalidatePath } from "next/cache";
import { toolAction } from "next-web-mcp/server";
import { createTodo, todoInput } from "./todos";

/**
 * Server action used by both the form on the page and the `add_todo` WebMCP tool.
 * Runs with the caller's session; an agent can only do what the user can do.
 * `toolAction` validates `text` again on the server and resolves to `{ ok, data | error }`
 * instead of throwing, so the tool can hand the agent a sentence with `unwrap()`.
 */
export const addTodo = toolAction(todoInput, async ({ text }) => {
  const todo = await createTodo(text);
  revalidatePath("/");
  return todo;
});

/** Form-action variant of `addTodo` for a plain `<form action>`. */
export async function addTodoFromForm(formData: FormData): Promise<void> {
  const result = await addTodo({ text: formData.get("text") });
  if (!result.ok) throw new Error(result.error);
}
