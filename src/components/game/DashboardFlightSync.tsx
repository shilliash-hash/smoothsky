import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Navigation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { operationalBoardQuery } from "@/lib/game";
import { readDivertState } from "@/lib/divert";
import { dashboardRefreshKeys, newlyArrivedFlights, type OperationSnapshot } from "@/lib/dashboard-operations";

export function DashboardFlightSync({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data, dataUpdatedAt } = useQuery(operationalBoardQuery(companyId));
  const observed = useRef(new Map<string, string>());
  const lastRefresh = useRef(0);
  const [arrival, setArrival] = useState<OperationSnapshot | null>(null);
  useEffect(() => {
    if (!data || lastRefresh.current === dataUpdatedAt) return;
    lastRefresh.current = dataUpdatedAt;
    for (const f of newlyArrivedFlights(observed.current, data.recent)) {
      setArrival(f);
      toast.success(`Flight ${f.flight_number ?? "—"} arrived at ${f.destination_icao} · Settlement complete`);
    }
    for (const f of [...data.active, ...data.recent]) observed.current.set(f.id, f.status);
    // A successful board poll also refreshes cached aircraft/financial data, including
    // arrivals that happened before this tab was mounted. Never invalidate the poll itself.
    for (const queryKey of dashboardRefreshKeys(companyId)) void qc.invalidateQueries({ queryKey });
  }, [companyId, data, dataUpdatedAt, qc]);

  const diverted = data?.active.filter(f => f.status === "DIVERTED") ?? [];
  return <div className="relative mt-4 space-y-2">
    {diverted.map(f => <section key={f.id} aria-label={`Diverted flight ${f.flight_number ?? "—"}`} className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-amber bg-panel px-4 py-3">
      <div className="min-w-0"><p className="readout break-words text-sm text-amber">{f.flight_number ?? "—"} · DIVERTED to {readDivertState(f.divert_state)?.airport ?? f.origin_icao}</p>
        <p className="mt-1 text-xs text-muted-foreground">Passengers and cargo on hold · Continue to {f.destination_icao} or abandon the contract.</p></div>
      <Button asChild size="sm" variant="outline"><Link to="/dispatch" search={{ aircraft: f.aircraft_id }} hash={`flight-${f.id}`}><Navigation className="h-4 w-4" />Continue / Abandon in Dispatch</Link></Button>
    </section>)}
    {arrival && <section role="status" className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-success bg-panel px-4 py-3">
      <p className="readout flex min-w-0 items-center gap-2 text-sm text-success"><Check className="h-4 w-4 shrink-0" /><span>{arrival.flight_number ?? "—"} · ARRIVED at {arrival.destination_icao} · Settlement complete</span></p>
      <Button asChild size="sm" variant="outline"><Link to="/logbook">Flight logbook</Link></Button>
    </section>}
  </div>;
}