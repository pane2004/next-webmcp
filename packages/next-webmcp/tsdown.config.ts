import { defineConfig } from "tsdown";

/**
 * Each client entry (`src/index.ts`, `src/form.tsx`, `src/devtools.tsx`) starts with a
 * `"use client"` directive; rolldown hoists the entry module's directive to the top of the
 * emitted chunk, so no banner is needed (a banner would duplicate it).
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    form: "src/form.tsx",
    devtools: "src/devtools.tsx",
    config: "src/config.ts",
    internal: "src/internal.ts",
  },
  format: ["esm"],
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "next",
      "zod",
      /^next\//,
      "server-only",
      "node:fs",
      "node:path",
    ],
  },
});
