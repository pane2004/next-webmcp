"use client";

import { ModelContext, ToolConfirmations } from "next-webmcp";
import { WebMCPDevTools } from "next-webmcp/devtools";
import { tools } from "./tools";

/**
 * Tool definitions contain Zod schemas and functions, which cannot be passed from a server component
 * to a client component as props. Import them here, inside a client module, and mount <ModelContext>.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelContext tools={tools}>
      {children}
      <ToolConfirmations />
      <WebMCPDevTools position="bottom-right" />
    </ModelContext>
  );
}
