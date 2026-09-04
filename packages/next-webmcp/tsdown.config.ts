import { defineConfig } from "tsdown";

const CLIENT_ENTRIES = new Set(["index", "form", "devtools"]);

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
  external: ["react", "react-dom", "react/jsx-runtime", "next", "zod", /^next\//, "server-only", "node:fs", "node:path"],
  outputOptions: {
    banner: (chunk) => {
      const base = chunk.fileName.replace(/\.(m?js|d\.m?ts)$/, "");
      return CLIENT_ENTRIES.has(base) ? '"use client";' : "";
    },
  },
});
