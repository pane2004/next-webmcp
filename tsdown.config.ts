import { defineConfig } from "tsdown";

// `unbundle` emits one file per source module, so each "use client" file keeps its own
// directive and `dist/index.js` is a plain barrel with none.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    form: "src/form.tsx",
    devtools: "src/devtools.tsx",
    manifest: "src/manifest.ts",
    server: "src/server.ts",
    internal: "src/internal.ts",
  },
  format: ["esm"],
  platform: "neutral",
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
});
