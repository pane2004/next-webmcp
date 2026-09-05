import { z } from "zod";

/**
 * In-memory todo store. Lives in the Node process, so it resets on restart and is per-instance.
 * Good enough for an example; swap for a database in a real app.
 */
export type Todo = { id: number; text: string };

/**
 * Input of `add_todo`, shared by the tool (app/tools.ts) and the `addTodo` server action
 * (app/actions.ts), so the browser and the server validate the same shape.
 */
export const todoInput = z.object({
  text: z.string().trim().min(1, "Todo text is empty.").max(200).describe("The todo text"),
});

const todos: Todo[] = [];

export async function listTodos(): Promise<Todo[]> {
  return todos;
}

export async function getTodo(id: number): Promise<Todo | undefined> {
  return todos.find((todo) => todo.id === id);
}

export async function createTodo(text: string): Promise<Todo> {
  const todo: Todo = { id: todos.length + 1, text };
  todos.push(todo);
  return todo;
}
