// Open-package defaults for the two provider interfaces.

import type { BillingProvider, ModerationProvider } from "./types";

// costFor/videoCost → 0, charge → always "ok", refund → no-op,
// getBalance → null. disabled marks it as a dummy: all coin/cost UI is
// hidden and the client never calls the balance endpoint.
export const freeBilling: BillingProvider = {
  charge: () => Promise.resolve("ok"),
  costFor: () => 0,
  disabled: true,
  getBalance: () => Promise.resolve(null),
  refund: () => Promise.resolve(),
  videoCost: () => 0,
};

// Always allows, never rewrites or blocks.
export const allowAllModeration: ModerationProvider = {
  check: () => Promise.resolve({ action: "allow" }),
};
