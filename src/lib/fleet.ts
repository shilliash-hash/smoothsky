import { queryOptions } from "@tanstack/react-query";
import { getFleetOverview, getAircraftFinance, getCompanyResults, getRegistrationRules } from "./fleet.functions";
export const fleetOverviewQuery = queryOptions({ queryKey: ["fleet-overview"], queryFn: () => getFleetOverview(), staleTime: 10000, refetchInterval: 60000 });
export const aircraftFinanceQuery = (aircraft: string) => queryOptions({ queryKey: ["aircraft-finance", aircraft], queryFn: () => getAircraftFinance({ data: { aircraft } }), enabled: !!aircraft });
export const companyResultsQuery = queryOptions({ queryKey: ["company-results"], queryFn: () => getCompanyResults(), refetchInterval: 15000 });
export const registrationRulesQuery = queryOptions({ queryKey: ["registration-rules"], queryFn: () => getRegistrationRules() });