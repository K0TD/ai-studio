import type { GenerationItem } from "../routerai/types";

export const ACTIVE_GENERATION_POLL_MS = 3000;
export const IDLE_GENERATION_POLL_MS = 15_000;
export const MAX_GENERATION_RETRY_MS = 30_000;

export const hasActiveGenerations = (items: GenerationItem[]): boolean =>
  items.some(
    (item) => item.status === "pending" || item.status === "reconciling"
  );

export const generationPollDelay = (
  hasActive: boolean,
  consecutiveFailures: number
): number => {
  if (consecutiveFailures > 0) {
    return Math.min(
      ACTIVE_GENERATION_POLL_MS * 2 ** consecutiveFailures,
      MAX_GENERATION_RETRY_MS
    );
  }
  return hasActive ? ACTIVE_GENERATION_POLL_MS : IDLE_GENERATION_POLL_MS;
};

export const mergeGenerationItems = (
  current: GenerationItem[],
  incoming: GenerationItem[]
): GenerationItem[] => {
  const items = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = items.get(item.id);
    if (
      !previous ||
      Date.parse(item.updatedAt) >= Date.parse(previous.updatedAt)
    ) {
      items.set(item.id, item);
    }
  }
  return [...items.values()].toSorted(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
};
