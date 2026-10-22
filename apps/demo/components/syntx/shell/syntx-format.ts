/**
 * Formatting helpers shared by the k0td AI Studio shell. Kept dependency-free so they
 * can be used from server and client components alike.
 */
const RUB_GROUPER = /\B(?=(\d{3})+(?!\d))/gu;
/** Formats a number as `1 250.00 ₽` — the format used across the mockups. */
export const formatRub = (value: number): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [whole, fraction] = safeValue.toFixed(2).split(".");
  return `${whole.replace(RUB_GROUPER, " ")}.${fraction} ₽`;
};
/** Compact timecode for duration chips: `5.0s`. */
export const formatSeconds = (seconds: number): string =>
  `${seconds.toFixed(1)}s`;
/** Russian date/time for generation cards and chat rows. */
export const formatDateTime = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};
/** Shortens a prompt into a chat title. */
export const toChatTitle = (prompt: string): string => {
  const normalized = prompt.replaceAll(/\s+/gu, " ").trim();
  if (normalized.length <= 44) {
    return normalized;
  }
  return `${normalized.slice(0, 43).trimEnd()}…`;
};
