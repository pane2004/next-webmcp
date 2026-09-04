/*
 * Server-side view of the `next-webmcp` entry, selected by the `react-server` export condition
 * (Server Components, route handlers, server actions). It carries NO "use client" directive:
 * `tool()`, `defineTools()`, `NextWebMCPError` and `isModelContextAvailable()` are the real
 * functions, so tool modules shared with `createManifestHandler()` load on the server. Everything
 * else is re-exported from the "use client" `index` chunk and stays a client reference (the build
 * keeps that import as `./index.js`; see tsdown.config.ts).
 */
export * from "./index.js";
export { tool, defineTools } from "./tool";
export { isModelContextAvailable } from "./native";
export { NextWebMCPError } from "./errors";
