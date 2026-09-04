"use client";

import { useModelContextTools } from "next-webmcp";

/**
 * Live table of the tools currently registered with `document.modelContext`.
 * Updates on Chrome's `toolchange` event, so it reflects route changes.
 *
 * @example
 * <ToolList />
 * @see app/learn/page.tsx
 */
export function ToolList() {
  const tools = useModelContextTools();

  if (tools.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No tools are registered yet. Open this site in Chrome 149+ with WebMCP enabled (the origin
        trial is active on the deployed site, or turn on chrome://flags/#enable-webmcp-testing) and
        this list fills in.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <tr>
            <th className="px-4 py-2">Tool</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Route</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr
              key={tool.name}
              className="border-t border-neutral-200 align-top dark:border-neutral-800"
            >
              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{tool.name}</td>
              <td className="px-4 py-2 text-neutral-700 dark:text-neutral-300">
                {tool.description}
              </td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                {tool.route ?? "declarative form"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
