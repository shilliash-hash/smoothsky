import { queryOptions } from "@tanstack/react-query";
import { getBases } from "./bases.functions";
export const basesQuery = queryOptions({ queryKey: ["bases"], queryFn: () => getBases(), staleTime: 10000, refetchInterval: 15000 });