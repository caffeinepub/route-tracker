import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "../backend.d";
import { useActor } from "./useActor";

export function useGetRoutes() {
  const { actor, isFetching } = useActor();
  return useQuery<Route[]>({
    queryKey: ["routes"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getRoutes();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useSaveRoute() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (route: Route) => {
      if (!actor) throw new Error("Actor not available");
      return actor.saveRoute(route);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

export function useDeleteRoute() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (index: bigint) => {
      if (!actor) throw new Error("Actor not available");
      return actor.deleteRoute(index);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}
