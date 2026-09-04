import { describe, expect, it, vi } from "vitest";

// Simulate a Zod build whose root export lacks `toJSONSchema` (Zod 3.x).
vi.mock("zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("zod")>();
  return { ...actual, toJSONSchema: undefined };
});

import { z } from "zod";
import { NextWebMCPError, defineTools, tool } from "../src/index";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof NextWebMCPError ? err.code : undefined;
  }
  return undefined;
}

describe("Zod without z.toJSONSchema", () => {
  it("tool() throws ZOD_TO_JSON_SCHEMA_UNSUPPORTED at definition time", () => {
    const define = (): unknown =>
      tool({
        name: "x",
        description: "x",
        input: z.object({ q: z.string() }),
        execute: () => async () => "",
      });
    expect(define).toThrowError(NextWebMCPError);
    expect(define).toThrowError(/zod@4/);
    expect(code(define)).toBe("ZOD_TO_JSON_SCHEMA_UNSUPPORTED");
  });

  it("defineTools() throws for plain definitions too", () => {
    expect(
      code(() =>
        defineTools({
          plain: { description: "x", input: z.object({}), execute: () => async () => "" },
        }),
      ),
    ).toBe("ZOD_TO_JSON_SCHEMA_UNSUPPORTED");
  });
});
