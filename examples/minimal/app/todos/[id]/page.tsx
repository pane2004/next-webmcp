import Link from "next/link";
import { notFound } from "next/navigation";
import { getTodo } from "../../todos";

export const dynamic = "force-dynamic";

/**
 * One todo by id. Exists so `navigate_to` has a dynamic route to open:
 * `{ route: "/todos/[id]", params: { id: "1" } }`.
 */
export default async function TodoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const todo = /^\d+$/.test(id) ? await getTodo(Number(id)) : undefined;
  if (!todo) notFound();
  return (
    <main>
      <h1>Todo #{todo.id}</h1>
      <p>{todo.text}</p>
      <p>
        <Link href="/">Back to the list</Link>
      </p>
    </main>
  );
}
