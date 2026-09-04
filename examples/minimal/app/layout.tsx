import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "next-webmcp minimal example",
  description: "Two WebMCP tools, one confirm card, one manifest.",
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
