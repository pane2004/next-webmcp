import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { NextWebMCPError, defineTools, tool, type ToolContext, type ToolDef } from "../src/index";
import { toolInputToJsonSchema } from "../src/schema";

describe("tool()", () => {
  it("returns the definition and infers the input type", () => {
    const def = tool({
      name: "add",
      description: "Adds",
      input: z.object({ a: z.number(), b: z.number().optional() }),
      execute: () => async (input) => {
        expectTypeOf(input).toEqualTypeOf<{ a: number; b?: number | undefined }>();
        return String(input.a + (input.b ?? 0));
      },
    });
    expect(def.name).toBe("add");
    expectTypeOf(def.confirm).toEqualTypeOf<
      | boolean
      | ((
          input: { a: number; b?: number | undefined },
          ctx: ToolContext,
        ) => {
          title: string;
          description?: string;
          details?: Array<{ label: string; value: string }>;
        })
      | undefined
    >();
    const list: ToolDef[] = [def];
    expect(list).toHaveLength(1);
  });

  it("rejects invalid names with TOOL_NAME_INVALID", () => {
    expect(() =>
      tool({
        name: "bad name!",
        description: "x",
        input: z.object({}),
        execute: () => async () => "",
      }),
    ).toThrowError(NextWebMCPError);
    try {
      tool({ name: "", description: "x", input: z.object({}), execute: () => async () => "" });
    } catch (err) {
      expect((err as NextWebMCPError).code).toBe("TOOL_NAME_INVALID");
    }
    expect(() =>
      tool({
        name: "a".repeat(129),
        description: "x",
        input: z.object({}),
        execute: () => async () => "",
      }),
    ).toThrow();
    expect(() =>
      tool({
        name: "ok_name-1.2",
        description: "x",
        input: z.object({}),
        execute: () => async () => "",
      }),
    ).not.toThrow();
  });
});

describe("defineTools()", () => {
  it("fills names from keys and keeps explicit names", () => {
    const tools = defineTools({
      search: tool({
        description: "Search",
        input: z.object({ q: z.string() }),
        execute: () => async () => "",
      }),
      explicit: tool({
        name: "other",
        description: "Other",
        input: z.object({}),
        execute: () => async () => "",
      }),
    });
    expect(tools.map((t) => t.name)).toEqual(["search", "other"]);
  });

  it("validates key-derived names", () => {
    expect(() =>
      defineTools({
        "bad key": { description: "x", input: z.object({}), execute: () => async () => "" },
      }),
    ).toThrowError(/TOOL_NAME_INVALID|invalid/i);
  });
});

describe("toolInputToJsonSchema()", () => {
  it("converts and strips $schema", () => {
    const json = toolInputToJsonSchema(
      z.object({ q: z.string().describe("Query"), n: z.number().int().optional() }),
    );
    expect(json).not.toHaveProperty("$schema");
    expect(json).toMatchObject({
      type: "object",
      properties: { q: { type: "string", description: "Query" }, n: { type: "integer" } },
      required: ["q"],
    });
  });
});
