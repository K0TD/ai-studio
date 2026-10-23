import { z } from "zod";

const epochMilliseconds = (epoch: number) =>
  Math.abs(epoch) < 100_000_000_000 ? epoch * 1000 : epoch;
const storedDate = z
  .union([
    z.date(),
    z
      .number()
      .finite()
      .transform((epoch) => new Date(epochMilliseconds(epoch))),
    z
      .string()
      .min(1)
      .transform((text) => {
        if (/^-?\d+$/u.test(text)) {
          return new Date(epochMilliseconds(Number(text)));
        }
        // SQLite's legacy datetime has no zone; it was always written as UTC.
        const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(
          text
        )
          ? `${text.replace(" ", "T")}Z`
          : text;
        return new Date(utc);
      }),
  ])
  .pipe(z.date());

// Invalid persisted dates must not renew quotes, leases or catalog freshness.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the persisted-date parsing boundary across PostgreSQL and SQLite.
export const toIsoDate = (value: unknown): string =>
  storedDate.parse(value).toISOString();
