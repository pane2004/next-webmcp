import { addTodoFromForm } from "./actions";
import { listTodos } from "./todos";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const todos = await listTodos();
  return (
    <main>
      <h1>Todos</h1>
      <p>
        This page exposes two WebMCP tools: <code>get_time</code> (read-only) and{" "}
        <code>add_todo</code> (asks for approval). Open the DevTools panel in the corner to call
        them, or ask an agent.
      </p>

      <form action={addTodoFromForm} style={{ display: "flex", gap: "0.5rem" }}>
        <input name="text" placeholder="New todo" required maxLength={200} />
        <button type="submit">Add</button>
      </form>

      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
      {todos.length === 0 ? <p>No todos yet.</p> : null}
    </main>
  );
}
