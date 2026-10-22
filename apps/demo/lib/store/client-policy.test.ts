import assert from "node:assert/strict";
import { test } from "node:test";

import type { ModelMetadata } from "../routerai/types";
import {
  safeCallbackUrl,
  modelAllowed,
  validQuote,
  normalizeRubInput,
} from "./client-policy";
test("login callback stays on the application origin", () => {
  assert.equal(safeCallbackUrl("/admin?tab=users"), "/admin?tab=users");
  for (const value of [
    undefined,
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/\n/evil.invalid",
    "/%5cevil.invalid",
    "/%2Fevil.invalid",
  ]) {
    assert.equal(safeCallbackUrl(value), "/");
  }
});
test("user permissions fail closed and VIP grants no implicit model access", () => {
  const model: ModelMetadata = {
    basePriceRub: 1,
    category: "video",
    id: "m",
    name: "Video model",
    priceUnit: "request",
    provider: "test",
  };
  const user = {
    isApproved: true,
    isBanned: false,
    permissions: { modelIds: [], sections: ["video"] },
    role: "vip",
  };
  assert.equal(modelAllowed(user, model), false);
  assert.equal(
    modelAllowed(
      { ...user, permissions: { modelIds: ["m"], sections: ["video"] } },
      model
    ),
    true
  );
  assert.equal(modelAllowed({ ...user, role: "admin" }, model), false);
  assert.equal(
    modelAllowed({ ...user, isBanned: true, role: "admin" }, model),
    false
  );
  assert.equal(
    modelAllowed({ ...user, isApproved: false, role: "admin" }, model),
    false
  );
  assert.equal(modelAllowed(null, model), false);
  assert.equal(modelAllowed(user), false);
});
test("quote requires valid expiry and enough funds for maximum reserve", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  const quote = { expiresAt: "2026-10-22T00:01:00Z", maxCostRub: "15.00" };
  assert.equal(validQuote(quote, "15.00", now), true);
  assert.equal(validQuote(quote, "14.99", now), false);
  assert.equal(validQuote(quote, "15.00", now + 60_000), false);
  assert.equal(
    validQuote({ ...quote, expiresAt: "invalid" }, "100.00", now),
    false
  );
  assert.equal(
    validQuote({ ...quote, maxCostRub: "Infinity" }, "100.00", now),
    false
  );
  assert.equal(
    validQuote({ ...quote, maxCostRub: "0.00" }, "100.00", now),
    false
  );
  assert.equal(validQuote(null, "100.00", now), false);
});
test("money input preserves exact decimal strings for credits and withdrawals", () => {
  assert.equal(normalizeRubInput("1000"), "1000.00");
  assert.equal(normalizeRubInput("-500.5"), "-500.50");
  assert.equal(normalizeRubInput("0001.01"), "1.01");
  for (const value of ["Infinity", "1e3", "1.001", "--5", "", "99999999999"]) {
    assert.throws(() => normalizeRubInput(value));
  }
});
