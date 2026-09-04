import { vi } from "vitest";

/** Mutable navigation state read by the `next/navigation` mock. */
export const nav = {
  params: {} as Record<string, string | string[]>,
  pathname: "/",
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
};

export function resetNav(): void {
  nav.params = {};
  nav.pathname = "/";
  for (const fn of Object.values(nav.router)) fn.mockReset();
}
