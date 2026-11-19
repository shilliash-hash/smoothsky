import { queryOptions } from "@tanstack/react-query";
import { getMissions } from "./missions.functions";
export const missionsQuery = queryOptions({ queryKey: ["missions"], queryFn: () => getMissions(), refetchInterval: 30000 });
export type Mission = Awaited<ReturnType<typeof getMissions>>["missions"][number];

/** Late delivery halves the fixed payout. */
export function missionPayout(payout: number, deadlineAt: string | null, at: number): { amount: number; late: boolean } {
  const late = !!deadlineAt && at > new Date(deadlineAt).getTime();
  return { amount: late ? Math.round(payout * 50) / 100 : payout, late };
}
