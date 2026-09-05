---
"next-web-mcp": patch
---

`useModelContextTools()` (and therefore `<WebMCPDevTools/>`) now shows real input schemas and annotations on Chrome 150, which returns `inputSchema` from `getTools()` as a JSON string and omits `annotations`. The registry keeps the schema and annotations handed to `registerTool` and prefers them over the browser copy.
