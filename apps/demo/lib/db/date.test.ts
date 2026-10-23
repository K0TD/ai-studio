import { expect, test } from "bun:test";

import { toIsoDate } from "./date";

test("database dates preserve UTC across epoch, PostgreSQL and legacy SQLite representations", () => {
  const iso = "2026-01-02T03:04:05.000Z";
  const date = new Date(iso);
  for (const representation of [
    date,
    date.getTime(),
    date.getTime() / 1000,
    String(date.getTime() / 1000),
    "2026-01-02 03:04:05",
    "2026-01-02T06:04:05+03:00",
  ]) {
    expect(toIsoDate(representation)).toBe(iso);
  }
  expect(toIsoDate(0)).toBe("1970-01-01T00:00:00.000Z");
});
test("invalid database dates never become the current time", () => {
  for (const invalid of [
    null,
    undefined,
    "",
    "not-a-date",
    Number.NaN,
    new Date(Number.NaN),
  ]) {
    expect(() => toIsoDate(invalid)).toThrow();
  }
});
