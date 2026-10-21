"use client";

import {
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { useStudioStore, useStudioStoreApi } from "../store/studio-store";
import { useStudioHttp } from "../studio-http-context";
import { GENERATIONS_QUERY_KEY } from "./use-generations";
import type { GenerationsData } from "./use-generations";

const DELETE_GENERATIONS_MUTATION_KEY = ["delete-generations"] as const;
const generationIdsSchema = z.array(z.string());

interface DeleteMutationContext {
  toastId: string | number;
}

// Soft-deletes generations on the server, then drops them from the gallery
// cache. Clears any selection and closes the lightbox if its image was among
// the deleted. A loading toast appears as soon as the request starts and
// morphs into the success/error state when it settles.
export const useDeleteGenerations = () => {
  const http = useStudioHttp();
  const queryClient = useQueryClient();
  const clearSelection = useStudioStore((s) => s.clearSelection);
  const closeLightbox = useStudioStore((s) => s.closeLightbox);
  const storeApi = useStudioStoreApi();

  return useMutation<string[], Error, string[], DeleteMutationContext>({
    mutationFn: async (ids: string[]) => {
      const { deletedIds } = await http
        .delete("generations", { json: { ids } })
        .json<{ deletedIds: string[] }>();
      return deletedIds;
    },
    mutationKey: DELETE_GENERATIONS_MUTATION_KEY,
    onError: (_error, _ids, context) => {
      toast.error("Couldn't delete — please try again", {
        id: context?.toastId,
      });
    },
    onMutate: (ids) => ({
      toastId: toast.loading(
        ids.length === 1 ? "Deleting image…" : `Deleting ${ids.length} images…`
      ),
    }),
    onSuccess: (deletedIds, _ids, context) => {
      const deletedIdSet = new Set(deletedIds);
      queryClient.setQueryData<GenerationsData>(
        GENERATIONS_QUERY_KEY,
        (old) =>
          old && {
            ...old,
            rows: old.rows.filter((row) => !deletedIdSet.has(row.id)),
          }
      );
      clearSelection();
      const { lightboxId } = storeApi.getState();
      if (lightboxId && deletedIds.includes(lightboxId)) {
        closeLightbox();
      }
      toast.success(
        deletedIds.length === 1
          ? "Image deleted"
          : `${deletedIds.length} images deleted`,
        { id: context?.toastId }
      );
    },
  });
};

// Ids of generations with an in-flight delete, so the gallery can gray them
// out. Derived from pending mutation state — clears itself when the request
// settles (including on error, un-graying the cards).
export const usePendingDeleteIds = (): Set<string> => {
  const pending = useMutationState({
    filters: {
      mutationKey: DELETE_GENERATIONS_MUTATION_KEY,
      status: "pending",
    },
    select: (mutation) => {
      const result = generationIdsSchema.safeParse(mutation.state.variables);
      return result.success ? result.data : [];
    },
  });
  return new Set(pending.flat());
};
