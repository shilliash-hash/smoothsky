import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlaneTakeoff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { operationalBoardQuery } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { FidsReadout } from "./FidsReadout";

const statuses: Record<string, string> = { EN_ROUTE: "EN ROUTE", DISPATCHED: "READY", COMPLETED: "ARRIVED", CANCELLED: "CANCELLED" };
const pilots: Record<string, string> = { ROSTER: "ROSTER PILOT", FREELANCE: "FREELANCER", FREELANCER: "FREELANCER", OWNER: "OWNER" };

export function OperationalFlightsBoard({ companyId }: { companyId: string }) {
  const { data, error, isPending, isFetching, refetch } = useQuery(operationalBoardQuery(companyId));
  const [view, setView] = useState<"active" | "recent">("active");
  const flights = data?.[view] ?? [];
  return <section className="min-w-0" aria-label="Operational flights">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><PlaneTakeoff className="h-4 w-4 text-amber" />Operational flights</h2>
      <Button asChild size="sm" variant="outline"><Link to="/dispatch">Flight operations</Link></Button>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <div role="group" aria-label="Flight board view" className="flex gap-1">
        <Button size="sm" variant={view === "active" ? "secondary" : "ghost"} aria-pressed={view === "active"} onClick={() => setView("active")}>Active {data ? `· ${data.active.length}` : ""}</Button>
        <Button size="sm" variant={view === "recent" ? "secondary" : "ghost"} aria-pressed={view === "recent"} onClick={() => setView("recent")}>Recent</Button>
      </div>
      <Button size="icon" variant="ghost" aria-label="Refresh flight board" title="Refresh flight board" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
    </div>
    <div className="mt-3 border-y border-border bg-panel">
      <div className="readout grid grid-cols-[1fr_1.2fr_1fr] gap-2 border-b border-border px-3 py-2 text-[10px] uppercase text-muted-foreground"><span>Flight / Aircraft</span><span>Route</span><span className="text-right">Status</span></div>
      {isPending || error || flights.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <PlaneTakeoff className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground" role={error ? "alert" : undefined}>{isPending ? "Loading flight board…" : error ? "Flight board unavailable." : view === "active" ? "No active flights" : "No recent flights"}</p>
        {error ? <Button size="sm" variant="outline" onClick={() => void refetch()}>Try again</Button> : !isPending && view === "active" ? <Button asChild variant="outline" size="sm"><Link to="/dispatch">Plan a flight</Link></Button> : null}
      </div> : <ol className="divide-y divide-border/60">{flights.map(flight => <li key={flight.id} className="flight-board-row grid grid-cols-[1fr_1.2fr_1fr] items-center gap-2 px-3 py-4">
        <div className="min-w-0"><p className="readout break-all text-sm text-amber">{flight.flight_number ?? "—"}</p><p className="readout mt-1 break-all text-[10px] text-muted-foreground">{flight.aircraft?.registration ?? "—"}</p></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-1 text-xs text-primary"><FidsReadout value={flight.origin_icao} /><span aria-label="to">→</span><FidsReadout value={flight.destination_icao} /></div><p className="readout mt-2 text-[10px] text-muted-foreground">{pilots[flight.pilot_mode ?? "OWNER"] ?? flight.pilot_mode} · {flight.passengers} PAX</p></div>
        <div className="min-w-0 text-right"><span className={`readout text-[11px] ${flight.status === "CANCELLED" ? "text-destructive" : flight.status === "EN_ROUTE" || flight.status === "COMPLETED" ? "text-primary" : "text-amber"}`}>{statuses[flight.status] ?? flight.status}</span><p className="readout mt-1 text-[10px] text-muted-foreground">{new Date(flight.completed_at ?? flight.created_at).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC</p></div>
      </li>)}</ol>}
    </div>
    <p className="readout mt-3 text-[10px] uppercase text-muted-foreground">{view === "active" ? "Company operations" : "Latest 8 company flights"} · UTC</p>
  </section>;
}