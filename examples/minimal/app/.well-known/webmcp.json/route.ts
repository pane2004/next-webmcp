import { createManifestHandler } from "next-webmcp/manifest";
import { tools } from "../../tools";

/**
 * Serves `/.well-known/webmcp.json` from the same tool definitions `<ModelContext>` mounts
 * (see app/providers.tsx), so the manifest never drifts from the app.
 *
 * @example
 * curl -s http://localhost:3000/.well-known/webmcp.json
 */
export const GET = createManifestHandler({ "/": tools });
