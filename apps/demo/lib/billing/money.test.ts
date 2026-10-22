import { describe, expect, test } from "bun:test";

import { costRub, formatKopecks, parseRub } from "./money";
describe("рубли и копейки", () => {
  test("сохраняет копейки, знак и предельную сумму без float", () => {
    expect(parseRub("9999999999.99")).toBe(999_999_999_999n);
    expect(parseRub("-12.01")).toBe(-1201n);
    expect(formatKopecks(-1n)).toBe("-0.01");
    expect(formatKopecks(parseRub("0.00"))).toBe("0.00");
    expect(formatKopecks(parseRub("0.1") + parseRub("0.2"))).toBe("0.30");
  });
  test("отклоняет неоднозначные суммы и переполнение", () => {
    for (const amount of [
      "",
      " 1.00",
      "01.00",
      "1,20",
      "NaN",
      "Infinity",
      "1e3",
      "0.001",
      "10000000000.00",
    ]) {
      expect(() => parseRub(amount)).toThrow();
    }
  });
  test("округляет стоимость провайдера half-up и учитывает фактический ноль", () => {
    expect(costRub(0)).toBe("0.00");
    expect(costRub(1e-8)).toBe("0.00");
    expect(costRub("0.0049")).toBe("0.00");
    expect(costRub(0.005)).toBe("0.01");
    expect(costRub("18.205")).toBe("18.21");
    for (const amount of [
      -1,
      Number.NaN,
      Infinity,
      "-0.01",
      null,
      {},
      "10000000000",
    ]) {
      expect(() => costRub(amount)).toThrow();
    }
  });
});
