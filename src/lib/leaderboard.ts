import { queryOptions } from "@tanstack/react-query";
import { getLeaderboard } from "./leaderboard.functions";
export const leaderboardQuery = queryOptions({
  queryKey: ["leaderboard"],
  queryFn: () => getLeaderboard(),
  staleTime: 30000,
  refetchInterval: 60000,
});