import "./setup";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ModelContext,
  NextWebMCPError,
  navigationTool,
  type NavigationRoute,
  type ToolContext,
} from "../src/index";
import { __resetForTests } from "../src/internal";
import {
  installFakeModelContext,
  uninstallFakeModelContext,
  type FakeModelContext,
} from "./fake-model-context";
import { nav, resetNav } from "./mock-navigation";

let fake: FakeModelContext;

beforeEach(() => {
  fake = installFakeModelContext();
  resetNav();
});
afterEach(async () => {
  // Drain any navigation a test scheduled but did not await, so it cannot leak into the next one.
  await tick();
  cleanup();
  __resetForTests();
  uninstallFakeModelContext();
});

const routes: NavigationRoute[] = [
  { path: "/", description: "Home page." },
  {
    path: "/search",
    description: "Search results.",
    query: z.object({ q: z.string().min(1), sort: z.enum(["price-asc", "price-desc"]).optional() }),
  },
  {
    path: "/product/[handle]",
    description: "Product detail page.",
    params: z.object({ handle: z.string().regex(/^[a-z0-9-]+$/) }),
  },
  { path: "/docs/[...slug]", description: "Documentation." },
];

/** Resolves after every `setTimeout(…, 0)` scheduled before it has run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Mounts the tool inside `<ModelContext>` so calls go through the real execute wrapper. */
function mount(options: Omit<Parameters<typeof navigationTool>[0], "routes"> = {}) {
  const def = navigationTool({ routes, ...options });
  render(<ModelContext tools={[def]} />);
  return def;
}

function call(name: string, args: object): Promise<unknown> {
  return fake.executeTool(name, JSON.stringify(args));
}

/** A `ToolContext` for calling `execute` directly (bypassing input validation). */
function directCtx(): ToolContext {
  return {
    params: {},
    pathname: "/",
    searchParams: new URLSearchParams(),
    router: nav.router as unknown as ToolContext["router"],
    confirm: async () => true,
  };
}

describe("navigationTool()", () => {
  it("registers as navigate_to with an enum of the allowlisted paths and no annotations", () => {
    const def = mount();
    expect(def.name).toBe("navigate_to");
    expect(def.annotations).toBeUndefined();
    const native = fake.tools.get("navigate_to");
    expect(native?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        route: { type: "string", enum: ["/", "/search", "/product/[handle]", "/docs/[...slug]"] },
        params: { type: "object", additionalProperties: { type: "string" } },
        query: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["route"],
    });
  });

  it("lists every route as '<path> — <description>' with the params and query it needs", () => {
    const def = mount();
    expect(def.description).toContain("Open another page of this site.");
    expect(def.description).toContain("- / — Home page.");
    expect(def.description).toContain("- /search — Search results. Query: q; optional: sort.");
    expect(def.description).toContain(
      "- /product/[handle] — Product detail page. Needs params: handle.",
    );
    expect(def.description).toContain("- /docs/[...slug] — Documentation. Needs params: slug.");
  });

  it("returns the result first and pushes the interpolated href afterwards", async () => {
    mount();
    await expect(
      call("navigate_to", { route: "/product/[handle]", params: { handle: "acme-cup" } }),
    ).resolves.toBe("Navigating to /product/acme-cup.");
    expect(nav.router.push).not.toHaveBeenCalled();
    await tick();
    expect(nav.router.push).toHaveBeenCalledTimes(1);
    expect(nav.router.push).toHaveBeenCalledWith("/product/acme-cup", undefined);
    expect(nav.router.replace).not.toHaveBeenCalled();
  });

  it("pushes a static route as-is", async () => {
    mount();
    await expect(call("navigate_to", { route: "/" })).resolves.toBe("Navigating to /.");
    await tick();
    expect(nav.router.push).toHaveBeenCalledWith("/", undefined);
  });

  it("encodes segment values so agent input can never leave the route", async () => {
    mount();
    await expect(
      call("navigate_to", { route: "/docs/[...slug]", params: { slug: "//evil.com/a b" } }),
    ).resolves.toBe("Navigating to /docs/evil.com/a%20b.");
    await tick();
    expect(nav.router.push).toHaveBeenCalledWith("/docs/evil.com/a%20b", undefined);

    const def = navigationTool({
      routes: [{ path: "/product/[handle]", description: "Product." }],
    });
    await expect(
      def.execute(directCtx())(
        { route: "/product/[handle]", params: { handle: "../..//evil.com?x#y" } },
        { signal: new AbortController().signal },
      ),
    ).resolves.toBe("Navigating to /product/..%2F..%2F%2Fevil.com%3Fx%23y.");
  });

  it("reports missing params without navigating", async () => {
    mount();
    await expect(call("navigate_to", { route: "/product/[handle]" })).resolves.toBe(
      'Route "/product/[handle]" needs params: handle.',
    );
    await expect(
      call("navigate_to", { route: "/product/[handle]", params: { handle: "" } }),
    ).resolves.toBe('Route "/product/[handle]" needs params: handle.');
    await expect(
      call("navigate_to", { route: "/docs/[...slug]", params: { slug: "/" } }),
    ).resolves.toBe('Route "/docs/[...slug]" needs params: slug.');
    await tick();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("validates params against the route's schema", async () => {
    mount();
    const result = await call("navigate_to", {
      route: "/product/[handle]",
      params: { handle: "Not Valid!" },
    });
    expect(result).toMatch(
      /^Invalid params for route "\/product\/\[handle\]": handle: .+\. Fix the arguments and call again\.$/,
    );
    await tick();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("rejects unknown routes", async () => {
    const def = mount();
    // Through <ModelContext> the enum rejects it before execute runs.
    await expect(call("navigate_to", { route: "/nope" })).resolves.toMatch(
      /^Invalid input for navigate_to: route: /,
    );
    // Called directly, execute lists the allowlist.
    await expect(
      def.execute(directCtx())({ route: "/nope" }, { signal: new AbortController().signal }),
    ).resolves.toBe(
      'Unknown route "/nope". Available: /, /search, /product/[handle], /docs/[...slug].',
    );
    await tick();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("appends an encoded query string and validates it against the route's schema", async () => {
    mount();
    await expect(
      call("navigate_to", {
        route: "/search",
        query: { q: "blue shirt & hat", sort: "price-asc" },
      }),
    ).resolves.toBe("Navigating to /search?q=blue+shirt+%26+hat&sort=price-asc.");
    await tick();
    expect(nav.router.push).toHaveBeenCalledWith(
      "/search?q=blue+shirt+%26+hat&sort=price-asc",
      undefined,
    );

    await expect(call("navigate_to", { route: "/search", query: { q: "" } })).resolves.toMatch(
      /^Invalid query for route "\/search": q: .+\. Fix the arguments and call again\.$/,
    );
    await expect(call("navigate_to", { route: "/search" })).resolves.toMatch(
      /^Invalid query for route "\/search": q: /,
    );
    await tick();
    expect(nav.router.push).toHaveBeenCalledTimes(1);
  });

  it("passes query through untouched on routes without a query schema", async () => {
    mount();
    await expect(call("navigate_to", { route: "/", query: { ref: "agent" } })).resolves.toBe(
      "Navigating to /?ref=agent.",
    );
  });

  it("uses router.replace and forwards scroll when configured", async () => {
    mount({ replace: true, scroll: false });
    await expect(call("navigate_to", { route: "/search", query: { q: "hat" } })).resolves.toBe(
      "Navigating to /search?q=hat.",
    );
    await tick();
    expect(nav.router.replace).toHaveBeenCalledWith("/search?q=hat", { scroll: false });
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("accepts a custom name and description", () => {
    const def = mount({ name: "go_to", description: "Jump to a store page." });
    expect(def.name).toBe("go_to");
    expect(fake.tools.has("go_to")).toBe(true);
    expect(fake.tools.has("navigate_to")).toBe(false);
    expect(def.description.startsWith("Jump to a store page.\nRoutes:\n- / — Home page.")).toBe(
      true,
    );
  });

  it("handles optional catch-all segments", async () => {
    const def = navigationTool({
      routes: [{ path: "/docs/[[...slug]]", description: "Docs." }],
    });
    expect(def.description).toContain("- /docs/[[...slug]] — Docs. Optional params: slug.");
    const run = def.execute(directCtx());
    const opts = { signal: new AbortController().signal };
    await expect(run({ route: "/docs/[[...slug]]" }, opts)).resolves.toBe("Navigating to /docs.");
    await expect(run({ route: "/docs/[[...slug]]", params: { slug: "a/b" } }, opts)).resolves.toBe(
      "Navigating to /docs/a/b.",
    );
  });

  it("throws TOOL_NAME_INVALID for an empty allowlist or a bad name", () => {
    expect(() => navigationTool({ routes: [] })).toThrowError(NextWebMCPError);
    try {
      navigationTool({ routes: [] });
    } catch (err) {
      expect((err as NextWebMCPError).code).toBe("TOOL_NAME_INVALID");
    }
    expect(() => navigationTool({ routes, name: "bad name!" })).toThrowError(NextWebMCPError);
  });
});
