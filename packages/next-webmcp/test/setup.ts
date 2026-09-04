import { vi } from "vitest";

vi.mock("next/navigation", async () => {
  const { nav } = await import("./mock-navigation");
  return {
    useParams: () => nav.params,
    usePathname: () => nav.pathname,
    useRouter: () => nav.router,
  };
});
