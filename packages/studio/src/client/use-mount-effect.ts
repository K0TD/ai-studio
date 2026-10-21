import { useEffect, useState } from "react";
import type { EffectCallback } from "react";

/**
 * Runs `effect` once on mount; its returned cleanup runs on unmount.
 * Wraps useEffect with an empty dep array to make one-time intent explicit.
 */
export const useMountEffect = (effect: EffectCallback): void => {
  const [mountEffect] = useState(() => effect);
  useEffect(mountEffect, [mountEffect]);
};
