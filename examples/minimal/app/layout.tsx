import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "next-web-mcp minimal example",
  description: "Three WebMCP tools, one manifest.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem auto", maxWidth: 640 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
