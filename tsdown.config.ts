import { defineConfig } from "tsdown";

/**
 * Each client entry (`src/index.ts`, `src/form.tsx`, `src/devtools.tsx`) starts with a
 * `"use client"` directive; rolldown hoists the entry module's directive to the top of the
 * emitted chunk, so no banner is needed (a banner would duplicate it). `src/manifest.ts`,
 * `src/server.ts` and `src/internal.ts` carry no directive: they are server-safe and must stay
 * free of React.
 */
/**
 * `src/index.server.ts` (the `react-server` build of the main entry) re-exports the components
 * from `./index.js`. Keep that import pointing at the emitted `dist/index.js` chunk, which carries
 * the "use client" directive, instead of letting rolldown inline the components into a shared
 * chunk without it: that is what keeps them client references in the Server Components layer.
 */
const keepIndexChunkImport = {
  name: "next-web-mcp:keep-index-chunk-import",
  resolveId(id: string, importer: string | undefined) {
    if (id === "./index.js" && importer && /src[\\/]index\.server\.ts$/.test(importer)) {
      return { id, external: true };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [keepIndexChunkImport],
  entry: {
    index: "src/index.ts",
    "index.server": "src/index.server.ts",
    form: "src/form.tsx",
    devtools: "src/devtools.tsx",
    manifest: "src/manifest.ts",
    server: "src/server.ts",
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
