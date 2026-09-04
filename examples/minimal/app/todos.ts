/**
 * In-memory todo store. Lives in the Node process, so it resets on restart and is per-instance.
 * Good enough for an example; swap for a database in a real app.
 */
export type Todo = { id: number; text: string };

const todos: Todo[] = [];

export async function listTodos(): Promise<Todo[]> {
  return todos;
}

export async function createTodo(text: string): Promise<Todo> {
  const todo: Todo = { id: todos.length + 1, text };
  todos.push(todo);
  return todo;
}
