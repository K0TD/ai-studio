import type { RunMetrics } from "../server/generation-repository";
import type { RunpodStatus } from "./runpod-client";

export const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED"]);

export const isTerminal = (status: RunpodStatus): boolean =>
  status.status === "COMPLETED" || TERMINAL_FAILURES.has(status.status ?? "");

export const metricsOf = (status: RunpodStatus): RunMetrics => ({
  delayTimeMs: status.delayTime,
  executionTimeMs: status.executionTime,
  runpodStatus: status.status,
  workerId: status.workerId,
});
