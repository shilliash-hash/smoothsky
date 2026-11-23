import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Globe2, Navigation, PlaneTakeoff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { operationalBoardQuery } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { liveRadarQuery } from "@/lib/live-radar";
import { FidsReadout } from "./FidsReadout";
import { readDivertState } from "@/lib/divert";

const statuses: Record<string, string> = { EN_ROUTE: "EN ROUTE", DISPATCHED: "READY", DIVERTED: "DIVERTED", COMPLETED: "ARRIVED", CANCELLED: "CANCELLED" };
const pilots: Record<string, string> = { ROSTER: "ROSTER PILOT", FREELANCE: "FREELANCER", FREELANCER: "FREELANCER", OWNER: "OWNER" };

export function OperationalFlightsBoard({ companyId }: { companyId: string }) {
  const { data, error, isPending, isFetching, refetch } = useQuery(operationalBoardQuery(companyId));
  const [view, setView] = useState<"active" | "recent" | "global">("active");
  const global = useQuery({ ...liveRadarQuery, enabled: view === "global" });
  const flights = view === "global" ? [] : data?.[view] ?? [];
  const isGlobal = view === "global";
  const boardPending = isGlobal ? global.isPending : isPending;
  const boardError = isGlobal ? global.error : error;
  const boardFetching = isGlobal ? global.isFetching : isFetching;
  const boardEmpty = isGlobal ? (global.data?.length ?? 0) === 0 : flights.length === 0;
  const refresh = () => void (isGlobal ? global.refetch() : refetch());
  return <section className="min-w-0" aria-label="Operational flights">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><PlaneTakeoff className="h-4 w-4 text-amber" />Operational flights</h2>
      <Button asChild size="sm" variant="outline"><Link to="/dispatch">Flight operations</Link></Button>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <div role="group" aria-label="Flight board view" className="flex gap-1">
        <Button size="sm" variant={view === "active" ? "secondary" : "ghost"} aria-pressed={view === "active"} onClick={() => setView("active")}>Active {data ? `· ${data.active.length}` : ""}</Button>
        <Button size="sm" variant={view === "recent" ? "secondary" : "ghost"} aria-pressed={view === "recent"} onClick={() => setView("recent")}>Recent</Button>
        <Button size="sm" variant={isGlobal ? "secondary" : "ghost"} aria-pressed={isGlobal} onClick={() => setView("global")}><Globe2 className="h-3.5 w-3.5" />Global {global.data ? `· ${global.data.length}` : ""}</Button>
      </div>
      <Button size="icon" variant="ghost" aria-label="Refresh flight board" title="Refresh flight board" disabled={boardFetching} onClick={refresh}><RefreshCw className={`h-3.5 w-3.5 ${boardFetching ? "motion-safe:animate-spin" : ""}`} /></Button>
    </div>
    <div className="mt-3 border-y border-border bg-panel">
      <div className="readout grid grid-cols-[1fr_1.2fr_1fr] gap-2 border-b border-border px-3 py-2 text-[10px] uppercase text-muted-foreground"><span>Flight / Aircraft</span><span>Route</span><span className="text-right">Status</span></div>
      {boardPending || (boardError && boardEmpty) || boardEmpty ? <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <PlaneTakeoff className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground" role={boardError ? "alert" : undefined}>{boardPending ? "Loading flight board…" : boardError ? "Flight board unavailable." : isGlobal ? "No active flights across the network" : view === "active" ? "No active flights" : "No recent flights"}</p>
        {boardError ? <Button size="sm" variant="outline" onClick={refresh}>Try again</Button> : !boardPending && view === "active" ? <Button asChild variant="outline" size="sm"><Link to="/dispatch">Plan a flight</Link></Button> : null}
      </div> : isGlobal ? <ol className="max-h-[28rem] divide-y divide-border/60 overflow-y-auto">{global.data?.map(flight => <li key={flight.id} className={`flight-board-row grid grid-cols-[1fr_1.2fr_1fr] items-center gap-2 px-3 py-4 ${flight.is_own ? "bg-primary/5" : ""}`}>
        <div className="min-w-0"><p className="break-words text-xs text-foreground">{flight.airline_name}{flight.is_own && <span className="readout ml-1 text-[10px] text-primary">YOU</span>}</p><p className="readout mt-1 break-all text-sm text-amber">{flight.flight_number ?? "—"}</p><p className="readout mt-1 break-words text-[10px] text-muted-foreground">{flight.registration} · {flight.aircraft_model}</p></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-1 text-xs text-primary"><FidsReadout value={flight.origin_icao} /><span aria-label="to">→</span><FidsReadout value={flight.destination_icao} /></div><p className="readout mt-2 text-[10px] text-muted-foreground">{flight.departed_at ? `DEP ${new Date(flight.departed_at).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC` : "Awaiting departure"}</p></div>
        <div className="min-w-0 text-right"><span className={`readout text-[11px] ${flight.status === "EN_ROUTE" ? "text-primary" : "text-amber"}`}>{statuses[flight.status] ?? flight.status}</span>{flight.status === "EN_ROUTE" && <p className="readout mt-1 text-[10px] text-muted-foreground">{flight.eta_at ? `ETA ${new Date(flight.eta_at).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC` : "ETA —"}</p>}</div>
      </li>)}</ol> : <ol className="divide-y divide-border/60">{flights.map(flight => <li key={flight.id} className="flight-board-row grid grid-cols-[1fr_1.2fr_1fr] items-center gap-2 px-3 py-4">
        <div className="min-w-0"><p className="readout break-all text-sm text-amber">{flight.flight_number ?? "—"}</p><p className="readout mt-1 break-all text-[10px] text-muted-foreground">{flight.aircraft?.registration ?? "—"}</p></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-1 text-xs text-primary"><FidsReadout value={flight.origin_icao} /><span aria-label="to">→</span><FidsReadout value={flight.destination_icao} /></div><p className="readout mt-2 text-[10px] text-muted-foreground">{pilots[flight.pilot_mode ?? "OWNER"] ?? flight.pilot_mode} · {flight.passengers} PAX</p></div>
        <div className="min-w-0 text-right"><span className={`readout text-[11px] ${flight.status === "CANCELLED" ? "text-destructive" : flight.status === "EN_ROUTE" || flight.status === "COMPLETED" ? "text-primary" : "text-amber"}`}>{statuses[flight.status] ?? flight.status}</span><p className="readout mt-1 text-[10px] text-muted-foreground">{new Date(flight.completed_at ?? flight.created_at).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC</p></div>
        {flight.status === "DIVERTED" && <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 border-l-2 border-amber pl-2">
          <p className="readout text-[10px] text-amber">At {readDivertState(flight.divert_state)?.airport ?? flight.origin_icao} · Contract on hold</p>
          <Button asChild variant="outline" size="sm" className="h-auto whitespace-normal py-2 text-xs text-amber"><Link to="/dispatch" search={{ aircraft: flight.aircraft_id }} hash={`flight-${flight.id}`}><Navigation className="h-3.5 w-3.5" />Resolve in Dispatch</Link></Button>
        </div>}
      </li>)}</ol>}
    </div>
    {boardError && !boardEmpty && <p role="alert" className="mt-2 text-xs text-amber">Refresh unavailable · Showing last received flights</p>}
    <p className="readout mt-3 text-[10px] uppercase text-muted-foreground">{isGlobal ? "Global network · Live" : view === "active" ? "Company operations" : "Latest 8 company flights"} · UTC</p>
  </section>;
}