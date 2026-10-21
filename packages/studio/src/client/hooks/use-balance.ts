"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BALANCE_QUERY_KEY } from "../../query-keys";
import { useStudioConfig } from "../studio-config-provider";
import { useStudioHttp } from "../studio-http-context";

export { BALANCE_QUERY_KEY } from "../../query-keys";

// Client-side coin balance for the studio chrome. Shared by the header (display)
// and the generate flow (affordability pre-check + post-generation refetch).
// Never fetches when the host's billing provider is disabled (dummy/free).
export const useBalance = () => {
  const config = useStudioConfig();
  const http = useStudioHttp();
  return useQuery({
    enabled: config.features.billing,
    // balance is null when the host's billing provider is unlimited.
    queryFn: () => http.get("balance").json<{ balance: number | null }>(),
    queryKey: BALANCE_QUERY_KEY,
  });
};

export const useInvalidateBalance = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
};
