"use server";

import { revalidatePath } from "next/cache";
import { createTodo, type Todo } from "./todos";

/**
 * Server action used by both the form on the page and the `add_todo` WebMCP tool.
 * Runs with the caller's session; an agent can only do what the user can do.
 */
export async function addTodo(text: string): Promise<Todo> {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Todo text is empty.");
  const todo = await createTodo(trimmed);
  revalidatePath("/");
  return todo;
}

/** Form-action variant of `addTodo` for a plain `<form action>`. */
export async function addTodoFromForm(formData: FormData): Promise<void> {
  await addTodo(String(formData.get("text") ?? ""));
}
