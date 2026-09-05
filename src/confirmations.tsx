"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { registry, type PendingConfirmation } from "./registry";

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const NO_CONFIRMATIONS: readonly PendingConfirmation[] = [];

function getNoConfirmations(): readonly PendingConfirmation[] {
  return NO_CONFIRMATIONS;
}

/**
 * Registers this instance as a confirmation renderer and returns the queue it should draw.
 * Only the first mounted instance (the registry's primary renderer) sees the live queue; every
 * other instance sees an empty list, so mounting the card twice never shows two dialogs.
 */
function useConfirmationQueue(): readonly PendingConfirmation[] {
  const id = useId();
  const subscribe = useCallback(
    (listener: () => void) => registry.subscribeConfirmations(id, listener),
    [id],
  );
  const getSnapshot = useCallback(
    () =>
      registry.primaryConfirmationRenderer() === id
        ? registry.getState().confirmations
        : NO_CONFIRMATIONS,
    [id],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getNoConfirmations);
}

const card: CSSProperties = {
  position: "fixed",
  right: "var(--next-web-mcp-offset, 16px)",
  bottom: "var(--next-web-mcp-offset, 16px)",
  zIndex: "var(--next-web-mcp-z-index, 2147483000)" as unknown as number,
  width: "min(360px, calc(100vw - 32px))",
  boxSizing: "border-box",
  padding: 16,
  borderRadius: "var(--next-web-mcp-radius, 12px)",
  background: "var(--next-web-mcp-bg, #ffffff)",
  color: "var(--next-web-mcp-fg, #111111)",
  border: "1px solid var(--next-web-mcp-border, rgba(0,0,0,0.12))",
  boxShadow: "var(--next-web-mcp-shadow, 0 8px 24px rgba(0,0,0,0.18))",
  font: "var(--next-web-mcp-font, 14px/1.4 system-ui, sans-serif)",
};

const button = (primary: boolean): CSSProperties => ({
  flex: 1,
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  border: primary
    ? "1px solid transparent"
    : "1px solid var(--next-web-mcp-border, rgba(0,0,0,0.2))",
  background: primary ? "var(--next-web-mcp-accent, #1d4ed8)" : "transparent",
  color: primary ? "var(--next-web-mcp-accent-fg, #ffffff)" : "inherit",
});

/**
 * Renders the pending confirmation card for tools that set `confirm`.
 * The outermost `<ModelContext>` mounts it for you; mount it yourself only when you pass
 * `confirmations={false}` there (for example to place it inside your own portal). Extra mounts are
 * harmless: only the first mounted instance draws the card.
 * Enter approves and Escape denies while focus is on the card (the Approve button is focused
 * automatically) or nowhere; keys typed into other inputs are ignored.
 * Style with CSS variables: `--next-web-mcp-bg`, `--next-web-mcp-fg`, `--next-web-mcp-accent`, `--next-web-mcp-border`,
 * `--next-web-mcp-radius`, `--next-web-mcp-offset`, `--next-web-mcp-z-index`, `--next-web-mcp-font`.
 *
 * @example
 * ```tsx
 * // app/layout.tsx — only needed with confirmations={false}
 * <ModelContext tools={tools} confirmations={false}>
 *   {children}
 *   <ToolConfirmations />
 * </ModelContext>
 * ```
 * @see https://github.com/pane2004/next-webmcp#toolconfirmations
 */
export function ToolConfirmations(): React.JSX.Element | null {
  const confirmations = useConfirmationQueue();
  const pending = confirmations[0];
  const queued = confirmations.length;
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => true);

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      // Only react to keys typed on the card itself (the Approve button is auto-focused) or with
      // nothing focused. Enter in a search box or newsletter form elsewhere must not approve an
      // agent-triggered action, and those forms must keep submitting normally.
      const target = event.target;
      const insideCard =
        target instanceof Node &&
        (target === document.body || cardRef.current?.contains(target) === true);
      if (!insideCard) return;
      if (event.key === "Enter") {
        event.preventDefault();
        pending.resolve(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        pending.resolve(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  if (!pending) return null;
  const { request } = pending;
  const titleId = `next-web-mcp-confirm-${pending.id}`;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-live="polite"
      aria-modal="false"
      aria-labelledby={titleId}
      data-next-web-mcp="confirm"
      style={{
        ...card,
        transition: reducedMotion ? "none" : "opacity 150ms ease, transform 150ms ease",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          opacity: 0.6,
          marginBottom: 4,
        }}
      >
        Agent wants to run <code style={{ font: "inherit" }}>{pending.toolName}</code>
        {queued > 1 ? ` (+${queued - 1} more)` : null}
      </div>
      <h2 id={titleId} style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>
        {request.title}
      </h2>
      {request.description ? (
        <p style={{ margin: "0 0 10px", opacity: 0.85 }}>{request.description}</p>
      ) : null}
      {request.details && request.details.length > 0 ? (
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 13 }}
        >
          <tbody>
            {request.details.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <th
                  scope="row"
                  style={{
                    textAlign: "left",
                    fontWeight: 500,
                    opacity: 0.7,
                    padding: "2px 8px 2px 0",
                    verticalAlign: "top",
                  }}
                >
                  {row.label}
                </th>
                <td style={{ padding: "2px 0", wordBreak: "break-word" }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={button(false)} onClick={() => pending.resolve(false)}>
          Deny
        </button>
        <button type="button" style={button(true)} autoFocus onClick={() => pending.resolve(true)}>
          Approve
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>
        Enter to approve · Esc to deny
      </div>
    </div>
  );
}
