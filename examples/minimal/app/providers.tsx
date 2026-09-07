"use client";

import { ModelContext } from "next-web-mcp";
import { WebMCPDevTools } from "next-web-mcp/devtools";
import { tools } from "./tools";

/**
 * Tool definitions contain Zod schemas and functions, which cannot be passed from a server component
 * to a client component as props. Import them here, inside a client module, and mount <ModelContext>.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModelContext tools={tools}>
      {children}
      <WebMCPDevTools position="bottom-right" />
    </ModelContext>
  );
}
