"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useModelContextTools, useToolCalls } from "./hooks";
import { errorMessage } from "./errors";
import { executeTool } from "./native";
import type { RegisteredToolInfo } from "./types";

/** Props for {@link WebMCPDevTools}. */
export type WebMCPDevToolsProps = {
  position?: "bottom-right" | "bottom-left";
  defaultOpen?: boolean;
  /** Render in production too (demos only). */
  force?: boolean;
};

type Tab = "tools" | "run" | "calls";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "tools", label: "Tools" },
  { id: "run", label: "Run" },
  { id: "calls", label: "Calls" },
];
const OTHER_ROUTE = "declarative / other";

const panelStyle: CSSProperties = {
  position: "fixed",
  bottom: "var(--nextjs-webmcp-offset, 16px)",
  zIndex: "var(--nextjs-webmcp-z-index, 2147483000)" as unknown as number,
  width: "min(420px, calc(100vw - 32px))",
  maxHeight: "min(70vh, 560px)",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  borderRadius: "var(--nextjs-webmcp-radius, 12px)",
  background: "var(--nextjs-webmcp-bg, #ffffff)",
  color: "var(--nextjs-webmcp-fg, #111111)",
  border: "1px solid var(--nextjs-webmcp-border, rgba(0,0,0,0.12))",
  boxShadow: "var(--nextjs-webmcp-shadow, 0 8px 24px rgba(0,0,0,0.18))",
  font: "var(--nextjs-webmcp-font, 13px/1.4 system-ui, sans-serif)",
  overflow: "hidden",
};
const toggleStyle: CSSProperties = {
  position: "fixed",
  bottom: "var(--nextjs-webmcp-offset, 16px)",
  zIndex: "var(--nextjs-webmcp-z-index, 2147483000)" as unknown as number,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid var(--nextjs-webmcp-border, rgba(0,0,0,0.2))",
  background: "var(--nextjs-webmcp-accent, #1d4ed8)",
  color: "var(--nextjs-webmcp-accent-fg, #ffffff)",
  font: "var(--nextjs-webmcp-font, 13px/1.4 system-ui, sans-serif)",
  fontWeight: 600,
  cursor: "pointer",
};
const smallButton: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--nextjs-webmcp-border, rgba(0,0,0,0.2))",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};
const pre: CSSProperties = {
  margin: "6px 0 0",
  padding: 8,
  borderRadius: 6,
  background: "var(--nextjs-webmcp-muted-bg, rgba(0,0,0,0.05))",
  fontSize: 11,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 200,
  overflow: "auto",
};

function ToolsTab({ tools }: { tools: RegisteredToolInfo[] }): React.JSX.Element {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const map = new Map<string, RegisteredToolInfo[]>();
    for (const t of tools) {
      const key = t.route ?? OTHER_ROUTE;
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === OTHER_ROUTE ? 1 : b === OTHER_ROUTE ? -1 : a.localeCompare(b),
    );
  }, [tools]);
  if (tools.length === 0)
    return <p style={{ opacity: 0.7 }}>No tools registered on document.modelContext.</p>;
  return (
    <div>
      {groups.map(([route, list]) => (
        <section key={route} style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 11, textTransform: "uppercase", opacity: 0.6 }}>
            {route}
          </h3>
          {list.map((t) => (
            <div
              key={t.name}
              style={{
                padding: "6px 0",
                borderTop: "1px solid var(--nextjs-webmcp-border, rgba(0,0,0,0.08))",
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <code style={{ fontWeight: 600, flex: 1 }}>{t.name}</code>
                <button
                  type="button"
                  style={smallButton}
                  onClick={() => setOpen((o) => ({ ...o, [t.name]: !o[t.name] }))}
                  aria-expanded={!!open[t.name]}
                >
                  Schema
                </button>
              </div>
              <div style={{ opacity: 0.8 }}>{t.description}</div>
              {open[t.name] ? (
                <pre style={pre}>{JSON.stringify(t.inputSchema ?? {}, null, 2)}</pre>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function RunTab({ tools }: { tools: RegisteredToolInfo[] }): React.JSX.Element {
  const [name, setName] = useState(tools[0]?.name ?? "");
  const [args, setArgs] = useState("{}");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = name || tools[0]?.name || "";
  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      JSON.parse(args);
      const result = await executeTool(selected, args);
      setOutput(
        result === null
          ? "navigated (null)"
          : typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2),
      );
    } catch (err) {
      setOutput(`Error: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label>
        Tool{" "}
        <select
          value={selected}
          onChange={(e) => setName(e.target.value)}
          style={{ font: "inherit", width: "100%" }}
        >
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        JSON args
        <textarea
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          rows={5}
          style={{
            font: "inherit",
            fontFamily: "monospace",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      </label>
      <button
        type="button"
        style={{ ...smallButton, fontWeight: 600 }}
        disabled={busy || !selected}
        onClick={() => void run()}
      >
        {busy ? "Running…" : "Run"}
      </button>
      {output !== null ? <pre style={pre}>{output}</pre> : null}
    </div>
  );
}

function CallsTab(): React.JSX.Element {
  const calls = useToolCalls();
  if (calls.length === 0) return <p style={{ opacity: 0.7 }}>No calls yet.</p>;
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {calls.map((c) => (
        <li
          key={c.id}
          style={{
            padding: "6px 0",
            borderTop: "1px solid var(--nextjs-webmcp-border, rgba(0,0,0,0.08))",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <span aria-label={c.ok ? "ok" : "failed"}>{c.ok ? "✓" : "✗"}</span>
            <code style={{ fontWeight: 600, flex: 1 }}>{c.name}</code>
            <span style={{ opacity: 0.6 }}>{c.durationMs} ms</span>
          </div>
          <div style={{ opacity: 0.6, fontSize: 11 }}>{c.route}</div>
          <pre style={pre}>{`args: ${JSON.stringify(c.args)}\n${c.result}`}</pre>
        </li>
      ))}
    </ol>
  );
}

/**
 * Floating dev panel: live tools (grouped by route), a runner using Chrome's `executeTool`,
 * and the call log. Returns `null` in production unless `force` is set.
 *
 * @example
 * ```tsx
 * import { WebMCPDevTools } from "nextjs-webmcp/devtools";
 * <body>{children}<WebMCPDevTools /></body>
 * ```
 * @see https://github.com/pane2004/next-webmcp#devtools
 */
export function WebMCPDevTools({
  position = "bottom-right",
  defaultOpen = false,
  force = false,
}: WebMCPDevToolsProps = {}): React.JSX.Element | null {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<Tab>("tools");
  const tools = useModelContextTools();
  if (process.env.NODE_ENV === "production" && !force) return null;
  const side: CSSProperties =
    position === "bottom-left"
      ? { left: "var(--nextjs-webmcp-offset, 16px)" }
      : { right: "var(--nextjs-webmcp-offset, 16px)" };

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open WebMCP DevTools"
        style={{ ...toggleStyle, ...side }}
        onClick={() => setOpen(true)}
      >
        WebMCP{tools.length ? ` (${tools.length})` : ""}
      </button>
    );
  }
  return (
    <div
      role="region"
      aria-label="WebMCP DevTools"
      data-nextjs-webmcp="devtools"
      style={{ ...panelStyle, ...side }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: 8,
          borderBottom: "1px solid var(--nextjs-webmcp-border, rgba(0,0,0,0.12))",
        }}
      >
        <strong style={{ flex: 1 }}>WebMCP</strong>
        <div role="tablist" aria-label="DevTools sections" style={{ display: "flex", gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              style={{ ...smallButton, fontWeight: tab === t.id ? 700 : 400 }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close WebMCP DevTools"
          style={smallButton}
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      <div role="tabpanel" style={{ padding: 10, overflow: "auto" }}>
        {tab === "tools" ? (
          <ToolsTab tools={tools} />
        ) : tab === "run" ? (
          <RunTab tools={tools} />
        ) : (
          <CallsTab />
        )}
      </div>
    </div>
  );
}
