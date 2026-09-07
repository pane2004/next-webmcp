import { resetWarnings } from "./errors";
import { registry } from "./registry";

export { registry };
export type { RegisteredRoute, Registry, RegistryState } from "./registry";

/**
 * Resets the registry and the warn-once memory. Test-only.
 *
 * @example
 * ```ts
 * afterEach(() => __resetForTests());
 * ```
 * @see https://github.com/pane2004/next-webmcp#testing
 */
export function __resetForTests(): void {
  registry.reset();
  resetWarnings();
}
