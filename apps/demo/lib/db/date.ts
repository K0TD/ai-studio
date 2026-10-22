export const toIsoDate = (value: unknown): string => {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
  }
  if (typeof value === "number") {
    // If timestamp is in seconds (unix epoch in seconds is ~1.7e9 < 1e11), convert to ms
    const ms = value < 100_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (typeof value === "string") {
    // Pure numeric string
    if (/^\d+$/.test(value)) {
      const num = Number(value);
      const ms = num < 100_000_000_000 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    // SQLite format "YYYY-MM-DD HH:MM:SS" -> convert to ISO UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
      const d = new Date(value.replace(" ", "T") + "Z");
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
};
