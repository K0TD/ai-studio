/* oxlint-disable anti-slop/no-runtime-typeof -- Console is an untyped I/O boundary; sanitize every supported runtime representation. */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { format } from "node:util";

import { getStorageDir } from "./db/storage-path";

type Service = "web" | "worker" | "startup";
type Level = "debug" | "info" | "warn" | "error" | "log";
type LogValue =
  | null
  | boolean
  | string
  | number
  | LogValue[]
  | { [key: string]: LogValue };
const levels: Level[] = ["debug", "info", "warn", "error", "log"];
const secretKey =
  /(?:password|secret|token|authorization|cookie|api.?key|signature|credential|base64|b64_json)/iu;
const redacted = "[REDACTED]";

// Logs accept arbitrary console arguments; this boundary never persists them without sanitizing.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Arbitrary console arguments are sanitized at this boundary.
export const sanitizeLogValue = (value: unknown): LogValue => {
  const seen = new WeakSet<object>();
  const secrets = Object.entries(process.env)
    .filter(([key, entry]) => secretKey.test(key) && entry && entry.length >= 4)
    .map(([, entry]) => entry ?? "");
  const cleanString = (input: string) => {
    let output = input;
    for (const secret of secrets) {
      output = output.replaceAll(secret, redacted);
    }
    return output
      .replaceAll(/data:[^\s"']+/giu, "[REDACTED_DATA]")
      .replaceAll(/\b(?:Bearer|Basic)\s+[^\s,;"']+/giu, redacted)
      .replaceAll(
        /\b(?:cookie|set-cookie|authorization|api[ _-]?key|(?:access[_-]?|refresh[_-]?)?token|password|secret)\s*[:=]\s*[^\r\n]+/giu,
        redacted
      )
      .replaceAll(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
        redacted
      )
      .replaceAll(/https?:\/\/[^\s<>"']+/giu, (raw) => {
        try {
          const url = new URL(raw);
          url.username = "";
          url.password = "";
          url.search = "";
          url.hash = "";
          return url.toString();
        } catch {
          return "[REDACTED_URL]";
        }
      })
      .replaceAll(/[A-Za-z0-9+/=_-]{128,}/gu, "[REDACTED_BINARY]")
      .slice(0, 16_384);
  };
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Recursive input comes from the same console boundary.
  const visit = (entry: unknown, depth = 0): LogValue => {
    if (depth > 8) {
      return "[TRUNCATED]";
    }
    if (entry instanceof Error) {
      return {
        message: cleanString(entry.message),
        name: cleanString(entry.name),
        stack: cleanString(entry.stack ?? ""),
      };
    }
    if (typeof entry === "string") {
      return cleanString(entry);
    }
    if (typeof entry === "bigint") {
      return entry.toString();
    }
    if (
      entry === null ||
      typeof entry === "boolean" ||
      typeof entry === "number"
    ) {
      return entry;
    }
    if (typeof entry !== "object") {
      return String(entry);
    }
    if (seen.has(entry)) {
      return "[CIRCULAR]";
    }
    seen.add(entry);
    if (Array.isArray(entry)) {
      return entry.slice(0, 100).map((item) => visit(item, depth + 1));
    }
    return Object.fromEntries(
      Object.entries(entry)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          secretKey.test(key) ? redacted : visit(item, depth + 1),
        ])
    );
  };
  return visit(value);
};

export const createLogWriter = (
  directory: string,
  service: Service,
  maximumBytes = 10 * 1024 * 1024,
  archives = 5
) => {
  mkdirSync(directory, { mode: 0o750, recursive: true });
  const filename = join(directory, `${service}.jsonl`);
  return (level: Level, args: unknown[]) => {
    let details = sanitizeLogValue(args);
    if (args.length === 1 && typeof args[0] === "string") {
      try {
        details = sanitizeLogValue(JSON.parse(args[0]));
      } catch {
        details = sanitizeLogValue({ message: args[0] });
      }
    }
    const sanitized = details;
    const line = `${JSON.stringify({ details: sanitized, level, service, timestamp: new Date().toISOString() })}\n`;
    if (
      existsSync(filename) &&
      statSync(filename).size + Buffer.byteLength(line) > maximumBytes
    ) {
      if (existsSync(`${filename}.${archives}`)) {
        unlinkSync(`${filename}.${archives}`);
      }
      for (let index = archives - 1; index >= 1; index -= 1) {
        if (existsSync(`${filename}.${index}`)) {
          renameSync(`${filename}.${index}`, `${filename}.${index + 1}`);
        }
      }
      renameSync(filename, `${filename}.1`);
    }
    appendFileSync(filename, line, { mode: 0o640 });
    return sanitized;
  };
};

// Next may load server modules more than once; keep one console wrapper per process.
// SAFETY: This module owns this optional global flag and checks it before use.
const state = globalThis as typeof globalThis & {
  studioLoggingInitialized?: boolean;
};
export const initLogging = (service: Service): void => {
  if (state.studioLoggingInitialized) {
    return;
  }
  const fallback = console.error.bind(console);
  let write: ReturnType<typeof createLogWriter>;
  try {
    write = createLogWriter(join(getStorageDir(), "logs"), service);
  } catch {
    fallback(
      JSON.stringify({ event: "logging.initialization_failed", service })
    );
    return;
  }
  state.studioLoggingInitialized = true;
  const failures = { reported: false };
  const debugOutput = console.debug.bind(console);
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const serverActionProbe = args.some((argument) =>
        String(argument).includes(
          "The Server Reference ID did not match the expected format"
        )
      );
      const logLevel = serverActionProbe ? "debug" : level;
      let sanitized: unknown;
      try {
        sanitized = write(logLevel, args);
      } catch {
        sanitized = sanitizeLogValue(args);
        if (!failures.reported) {
          failures.reported = true;
          fallback(JSON.stringify({ event: "logging.write_failed", service }));
        }
      }
      (serverActionProbe ? debugOutput : original)(
        typeof sanitized === "string" ? sanitized : format("%j", sanitized)
      );
    };
  }
  console.info(JSON.stringify({ event: "logging.initialized", service }));
};
