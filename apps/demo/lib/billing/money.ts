import { z } from "zod";
const MONEY_PATTERN = /^(-?)(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/u;
const MAX_KOPECKS = 999_999_999_999n;
export const parseRub = (amount: string): bigint => {
  const parts = MONEY_PATTERN.exec(amount);
  if (!parts) {
    throw new RangeError("Некорректная сумма в рублях");
  }
  const kopecks =
    BigInt(parts[2]) * 100n + BigInt((parts[3] ?? "").padEnd(2, "0"));
  if (kopecks > MAX_KOPECKS) {
    throw new RangeError("Сумма превышает допустимый предел");
  }
  return parts[1] ? -kopecks : kopecks;
};
export const formatKopecks = (kopecks: bigint): string => {
  const absolute = kopecks < 0n ? -kopecks : kopecks;
  return `${kopecks < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};
// Provider prices may have sub-kopeck precision; zero is a valid reported cost.
const providerPriceSchema = z.union([
  z
    .number()
    .finite()
    .nonnegative()
    .lt(10_000_000_000)
    .transform((amount) => amount.toFixed(12)),
  z.string().regex(/^\d{1,10}(?:\.\d{1,12})?$/u),
]);
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the provider-price parsing boundary; arbitrary JSON is validated before arithmetic.
export const costRub = (providerCost: unknown): string => {
  const parsed = providerPriceSchema.safeParse(providerCost);
  if (!parsed.success) {
    throw new RangeError("Некорректная стоимость провайдера");
  }
  const [rubles, fraction = ""] = parsed.data.split(".");
  const cents =
    BigInt(rubles) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  const rounded = cents + (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n);
  if (rounded > MAX_KOPECKS) {
    throw new RangeError("Стоимость превышает допустимый предел");
  }
  return formatKopecks(rounded);
};
