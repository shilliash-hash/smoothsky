export const ACTIVE_OPERATION_STATUSES = ["DISPATCHED", "EN_ROUTE", "DIVERTED"];

export type OperationSnapshot = {
  id: string;
  status: string;
  flight_number: string | null;
  destination_icao: string;
};

/** Only announce transitions observed during this visit, never historical arrivals. */
export function newlyArrivedFlights<T extends OperationSnapshot>(previous: ReadonlyMap<string, string>, recent: T[]): T[] {
  return recent.filter(f => f.status === "COMPLETED" && ACTIVE_OPERATION_STATUSES.includes(previous.get(f.id) ?? ""));
}

export function dashboardRefreshKeys(companyId: string) {
  return [["company"], ["fleet", companyId], ["ledger", companyId], ["ledger-aircraft", companyId],
    ["transaction-history", companyId], ["fleet-overview"], ["aircraft-finance"], ["bases"], ["company-results"], ["operations"], ["flight-logbook", companyId]];
}