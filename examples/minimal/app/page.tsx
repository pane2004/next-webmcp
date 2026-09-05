import Link from "next/link";
import { addTodoFromForm } from "./actions";
import { listTodos } from "./todos";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const todos = await listTodos();
  return (
    <main>
      <h1>Todos</h1>
      <p>
        This page exposes three WebMCP tools: <code>get_time</code> (read-only),{" "}
        <code>add_todo</code> (asks for approval, then runs a server action) and{" "}
        <code>navigate_to</code> (opens the list or one todo). Open the DevTools panel in the corner
        to call them, or ask an agent.
      </p>

      <form action={addTodoFromForm} style={{ display: "flex", gap: "0.5rem" }}>
        <input name="text" placeholder="New todo" required maxLength={200} />
        <button type="submit">Add</button>
      </form>

      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <Link href={`/todos/${todo.id}`}>#{todo.id}</Link> {todo.text}
          </li>
        ))}
      </ul>
      {todos.length === 0 ? <p>No todos yet.</p> : null}
    </main>
  );
}
