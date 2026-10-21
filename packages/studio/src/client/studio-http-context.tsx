"use client";

// Client-side HTTP boundary: package code
// can't assume a host mounts createStudioHandlers at any particular path, so
// the ky instance is built once by <Studio> from config.apiBasePath (default
// "/api/studio") and provided here instead of a module-level singleton.

import ky, { HTTPError } from "ky";
import type { KyInstance } from "ky";
import { createContext, useContext, useState } from "react";

const DEFAULT_API_BASE_PATH = "/api/studio";

const StudioHttpContext = createContext<KyInstance | null>(null);

export const StudioHttpProvider = ({
  apiBasePath,
  children,
}: {
  apiBasePath?: string;
  children: React.ReactNode;
}) => {
  const [client] = useState(() =>
    ky.create({ prefix: apiBasePath ?? DEFAULT_API_BASE_PATH })
  );
  return (
    <StudioHttpContext.Provider value={client}>
      {children}
    </StudioHttpContext.Provider>
  );
};

export const useStudioHttp = (): KyInstance => {
  const client = useContext(StudioHttpContext);
  if (!client) {
    throw new Error("useStudioHttp() called outside <Studio>");
  }
  return client;
};

// Returns the HTTP status of a ky error, or null for network/other failures.
export const httpStatusOf = <Failure,>(error: Failure): number | null =>
  error instanceof HTTPError ? error.response.status : null;
