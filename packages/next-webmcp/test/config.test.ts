import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withWebMCP } from "../src/config";

const scratch = process.env["CLAUDE_SCRATCHPAD_DIR"] ?? tmpdir();
let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("withWebMCP()", () => {
  it("returns the config untouched without a manifest", () => {
    const config = { reactStrictMode: true };
    expect(withWebMCP(config)).toBe(config);
  });

  it("writes the manifest to outFile", () => {
    dir = mkdtempSync(join(scratch, "webmcp-"));
    const outFile = join(dir, "public", ".well-known", "webmcp.json");
    const routes = [
      {
        route: "/products/[id]",
        tools: [{ name: "addToCart", description: "Add", inputSchema: { type: "object" } }],
      },
    ];
    withWebMCP({}, { manifest: { routes, outFile } });
    expect(existsSync(outFile)).toBe(true);
    expect(JSON.parse(readFileSync(outFile, "utf8"))).toEqual({
      version: 1,
      generator: "next-webmcp",
      routes,
    });
  });
});
