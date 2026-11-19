import { queryOptions } from "@tanstack/react-query";
import { getFleetOverview, getAircraftFinance } from "./fleet.functions";
export const fleetOverviewQuery = queryOptions({ queryKey: ["fleet-overview"], queryFn: () => getFleetOverview(), staleTime: 10000, refetchInterval: 60000 });
export const aircraftFinanceQuery = (aircraft: string) => queryOptions({ queryKey: ["aircraft-finance", aircraft], queryFn: () => getAircraftFinance({ data: { aircraft } }), enabled: !!aircraft });