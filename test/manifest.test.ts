import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NextWebMCPError, defineTools, tool } from "../src/index";
import { buildManifest, createManifestHandler } from "../src/manifest";
import type { ToolDef } from "../src/types";

const noop = () => async () => "ok";

const rootTools = defineTools({
  search: tool({
    description: "Search the catalog",
    input: z.object({ q: z.string().min(1).describe("Keyword") }),
    annotations: { readOnlyHint: true },
    execute: noop,
  }),
  checkout: tool({
    title: "Start checkout",
    description: "Hand the cart to checkout",
    input: z.object({}),
    confirm: true,
    execute: noop,
  }),
});

const productTools = defineTools({
  add_to_cart: tool({
    description: "Add this product",
    input: z.object({ quantity: z.number().int().min(1).default(1) }),
    execute: noop,
  }),
});

describe("buildManifest()", () => {
  it("lists every route with JSON Schema inputs and no execute", () => {
    const manifest = buildManifest({ "/": rootTools, "/product/[handle]": productTools });
    expect(manifest).toEqual({
      version: 1,
      routes: [
        {
          route: "/",
          tools: [
            {
              name: "search",
              description: "Search the catalog",
              inputSchema: {
                type: "object",
                properties: { q: { type: "string", minLength: 1, description: "Keyword" } },
                required: ["q"],
              },
              annotations: { readOnlyHint: true },
            },
            {
              name: "checkout",
              title: "Start checkout",
              description: "Hand the cart to checkout",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
        {
          route: "/product/[handle]",
          tools: [
            {
              name: "add_to_cart",
              description: "Add this product",
              inputSchema: {
                type: "object",
                properties: {
                  quantity: { type: "integer", minimum: 1, maximum: 9007199254740991, default: 1 },
                },
              },
            },
          ],
        },
      ],
    });
    for (const route of manifest.routes) {
      for (const entry of route.tools) {
        expect(entry).not.toHaveProperty("execute");
        expect(entry).not.toHaveProperty("confirm");
        expect(entry).not.toHaveProperty("input");
      }
    }
  });

  it("survives JSON round-tripping", () => {
    const manifest = buildManifest({ "/": rootTools });
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("throws TOOL_NAME_INVALID for a nameless tool", () => {
    const nameless: ToolDef = { description: "No name", input: z.object({}), execute: noop };
    expect(() => buildManifest({ "/": [nameless] })).toThrowError(NextWebMCPError);
    try {
      buildManifest({ "/": [nameless] });
    } catch (err) {
      expect(err).toBeInstanceOf(NextWebMCPError);
      expect((err as NextWebMCPError).code).toBe("TOOL_NAME_INVALID");
      expect((err as NextWebMCPError).message).toContain('route "/"');
    }
  });

  it("throws TOOL_NAME_INVALID for a hand-written tool with a bad name", () => {
    const bad: ToolDef = {
      name: "bad name!",
      description: "x",
      input: z.object({}),
      execute: noop,
    };
    expect(() => buildManifest({ "/": [bad] })).toThrowError(/invalid/);
  });
});

describe("createManifestHandler()", () => {
  it("returns a JSON response matching buildManifest() for a static map", async () => {
    const GET = createManifestHandler({ "/": rootTools });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await res.json()).toEqual(buildManifest({ "/": rootTools }));
  });

  it("calls an async factory on every request", async () => {
    let calls = 0;
    const GET = createManifestHandler(async () => {
      calls += 1;
      return calls === 1
        ? { "/": rootTools }
        : { "/": rootTools, "/product/[handle]": productTools };
    });
    const first = (await (await GET()).json()) as { routes: unknown[] };
    const second = (await (await GET()).json()) as { routes: unknown[] };
    expect(first.routes).toHaveLength(1);
    expect(second.routes).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it("fails fast on a bad static map", () => {
    const nameless: ToolDef = { description: "No name", input: z.object({}), execute: noop };
    expect(() => createManifestHandler({ "/": [nameless] })).toThrowError(NextWebMCPError);
  });
});
