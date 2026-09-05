import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { unwrap } from "../src/index";
import { formatZodIssues } from "../src/schema";
import { toolAction, type ToolActionResult } from "../src/server";

const searchInput = z.object({
  q: z.string().min(1),
  page: z.number().int().min(1).default(1),
});

function silenceConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("toolAction()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands the handler the parsed input (defaults applied) and returns its data", async () => {
    const handler = vi.fn(async (input: z.infer<typeof searchInput>) => ({
      hits: [input.q],
      page: input.page,
    }));
    const search = toolAction(searchInput, handler);

    const result = await search({ q: "shoes" });

    expect(result).toEqual({ ok: true, data: { hits: ["shoes"], page: 1 } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ q: "shoes", page: 1 });
  });

  it("accepts a synchronous handler", async () => {
    const double = toolAction(z.object({ n: z.number() }), ({ n }) => n * 2);
    await expect(double({ n: 21 })).resolves.toEqual({ ok: true, data: 42 });
  });

  it("returns a serializable object from an async function (usable as a server action)", async () => {
    const action = toolAction(z.object({}), async () => ({ when: "now" }));
    const pending = action({});
    expect(pending).toBeInstanceOf(Promise);
    const result = await pending;
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("rejects invalid input with the formatted issues and never calls the handler", async () => {
    const handler = vi.fn(async () => "never");
    const search = toolAction(searchInput, handler);

    await expect(search({ q: "", page: 0 })).resolves.toEqual({
      ok: false,
      error:
        "Invalid input: q: Too small: expected string to have >=1 characters; page: Too small: expected number to be >=1. Fix the arguments and call again.",
    });
    await expect(search({ q: 42 })).resolves.toEqual({
      ok: false,
      error:
        "Invalid input: q: Invalid input: expected string, received number. Fix the arguments and call again.",
    });
    await expect(search("nope")).resolves.toEqual({
      ok: false,
      error:
        "Invalid input: (root): Invalid input: expected object, received string. Fix the arguments and call again.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("words invalid input exactly like <ModelContext> (shared formatter)", async () => {
    const search = toolAction(searchInput, async () => "never");
    const issues = searchInput.safeParse({ q: "", page: 0 }).error!.issues;
    const result = await search({ q: "", page: 0 });
    expect(result).toEqual({
      ok: false,
      error: `Invalid input: ${formatZodIssues(issues)}. Fix the arguments and call again.`,
    });
  });

  it("supports async refinements", async () => {
    const input = z.object({
      handle: z.string().refine(async (h) => h !== "taken", { message: "Handle is taken" }),
    });
    const claim = toolAction(input, async ({ handle }) => `claimed ${handle}`);
    await expect(claim({ handle: "free" })).resolves.toEqual({ ok: true, data: "claimed free" });
    await expect(claim({ handle: "taken" })).resolves.toEqual({
      ok: false,
      error: "Invalid input: handle: Handle is taken. Fix the arguments and call again.",
    });
  });

  it("resolves (never rejects) when a transform in the input schema throws a non-Zod error", async () => {
    const error = silenceConsoleError();
    const input = z.object({ raw: z.string().transform((s) => JSON.parse(s) as unknown) });
    const handler = vi.fn(async () => "never");
    const parse = toolAction(input, handler);

    await expect(parse({ raw: "{bad" })).resolves.toEqual({
      ok: false,
      error: "The action failed on the server. Try again.",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(SyntaxError);

    const mapped = toolAction(input, handler, {
      onError: (err) =>
        err instanceof SyntaxError ? "raw must be JSON." : "Something else broke.",
    });
    await expect(mapped({ raw: "{bad" })).resolves.toEqual({
      ok: false,
      error: "raw must be JSON.",
    });
  });

  it("resolves (never rejects) when the output schema throws while parsing", async () => {
    const error = silenceConsoleError();
    const output = z.string().transform((s): string => {
      throw new Error(`cannot format ${s}`);
    });
    const action = toolAction(z.object({}), async () => "value", { output });
    await expect(action({})).resolves.toEqual({
      ok: false,
      error: "The action failed on the server. Try again.",
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("logs a thrown handler error and returns a generic sentence without the message", async () => {
    const error = silenceConsoleError();
    const boom = new Error("connect ECONNREFUSED db.internal:5432 (password hunter2)");
    const action = toolAction(z.object({}), async () => {
      throw boom;
    });

    const result = await action({});

    expect(result).toEqual({ ok: false, error: "The action failed on the server. Try again." });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(boom);
  });

  it("handles non-Error throws the same way", async () => {
    const error = silenceConsoleError();
    const action = toolAction(z.object({}), async () => {
      throw "plain string reason";
    });
    await expect(action({})).resolves.toEqual({
      ok: false,
      error: "The action failed on the server. Try again.",
    });
    expect(error).toHaveBeenCalledWith("plain string reason");
  });

  it("lets onError choose the sentence the agent sees", async () => {
    const error = silenceConsoleError();
    class OutOfStock extends Error {}
    const addToCart = toolAction(
      z.object({ sku: z.string() }),
      async ({ sku }) => {
        throw new OutOfStock(sku);
      },
      {
        onError: (err) =>
          err instanceof OutOfStock ? `${err.message} is out of stock.` : "Something else broke.",
      },
    );

    await expect(addToCart({ sku: "A1" })).resolves.toEqual({
      ok: false,
      error: "A1 is out of stock.",
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("falls back to the generic sentence when onError itself throws", async () => {
    const error = silenceConsoleError();
    const action = toolAction(
      z.object({}),
      async () => {
        throw new Error("first");
      },
      {
        onError: () => {
          throw new Error("second");
        },
      },
    );
    await expect(action({})).resolves.toEqual({
      ok: false,
      error: "The action failed on the server. Try again.",
    });
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("validates the result against the output schema", async () => {
    const error = silenceConsoleError();
    const output = z.object({ total: z.number() });
    const broken = toolAction(
      z.object({}),
      async () => ({ total: "oops" }) as unknown as { total: number },
      { output },
    );

    await expect(broken({})).resolves.toEqual({
      ok: false,
      error: "The server returned an unexpected result.",
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain(
      "total: Invalid input: expected number, received string",
    );
  });

  it("returns the output-parsed data (unknown keys stripped) when the schema matches", async () => {
    const output = z.object({ total: z.number() });
    const action = toolAction(
      z.object({}),
      async () => ({ total: 3, secret: "internal" }) as { total: number },
      { output },
    );
    await expect(action({})).resolves.toEqual({ ok: true, data: { total: 3 } });
  });
});

describe("toolAction() types", () => {
  it("infers the handler input from the schema and the result from the handler or output", () => {
    const fromHandler = toolAction(searchInput, async ({ q, page }) => {
      expectTypeOf(q).toEqualTypeOf<string>();
      expectTypeOf(page).toEqualTypeOf<number>();
      return [q];
    });
    expectTypeOf(fromHandler).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(fromHandler).returns.resolves.toEqualTypeOf<ToolActionResult<string[]>>();

    const fromOutput = toolAction(searchInput, async ({ q }) => ({ hits: [q] }), {
      output: z.object({ hits: z.array(z.string()) }),
    });
    expectTypeOf(fromOutput).returns.resolves.toEqualTypeOf<ToolActionResult<{ hits: string[] }>>();

    toolAction(searchInput, async () => ({ hits: 1 }), {
      // @ts-expect-error the handler's result must satisfy the output schema
      output: z.object({ hits: z.array(z.string()) }),
    });
  });
});

describe("unwrap()", () => {
  it("returns the data of an ok result", () => {
    const result: ToolActionResult<number[]> = { ok: true, data: [1, 2] };
    expect(unwrap(result)).toEqual([1, 2]);
  });

  it("throws Error(result.error) for a failed result", () => {
    const result: ToolActionResult<number[]> = { ok: false, error: "A1 is out of stock." };
    expect(() => unwrap(result)).toThrowError("A1 is out of stock.");
    try {
      unwrap(result);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("A1 is out of stock.");
    }
  });

  it("round-trips a toolAction result", async () => {
    silenceConsoleError();
    const ok = toolAction(z.object({ n: z.number() }), async ({ n }) => n + 1);
    const bad = toolAction(z.object({ n: z.number() }), async () => {
      throw new Error("nope");
    });
    expect(unwrap(await ok({ n: 1 }))).toBe(2);
    await expect(bad({ n: 1 }).then(unwrap)).rejects.toThrowError(
      "The action failed on the server. Try again.",
    );
  });
});

describe("formatZodIssues()", () => {
  it("joins dotted paths with '; ' and labels top-level issues '(root)'", () => {
    expect(
      formatZodIssues([
        { path: ["items", 0, "sku"], message: "Required" },
        { path: [], message: "Expected object" },
      ]),
    ).toBe("items.0.sku: Required; (root): Expected object");
  });
});
