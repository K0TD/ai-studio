"use client";

import { useCallback, useSyncExternalStore } from "react";

const getServerSnapshot = (): boolean => false;

/**
 * Subscribes to a CSS media query without an effect-driven first render.
 * The server snapshot is always `false`, then React re-reads on hydration.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

const subscribeToHydration = (): (() => void) => () => {
  /* empty */
};

/**
 * `false` during SSR and the hydration pass, `true` immediately after mount.
 * Used by the shell to avoid rendering localStorage-backed Zustand state (and
 * locale-formatted dates) on the server, which would otherwise hydrate with
 * mismatched text.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
