import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Fuel, Briefcase, Wrench, Plane, CircleDot, Star } from "lucide-react";
import { getPublicCompanyProfile } from "@/lib/leaderboard.functions";
import { SupporterBadge } from "./SupporterBadge";

const NetworkMiniMap = lazy(() => import("./NetworkMiniMap"));
const mapFallback = <div className="aspect-square w-full animate-pulse border border-border bg-panel" />;

export function CompanyDossier({ icao, open, onOpenChange }: { icao: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const fn = useServerFn(getPublicCompanyProfile);
  const { data: p, isLoading } = useQuery({ queryKey: ["public-company", icao], queryFn: () => fn({ data: { icao: icao! } }), enabled: open && !!icao, staleTime: 30000 });
  const [all, setAll] = useState(false);
  const flights = p ? (all ? p.flights : p.flights.slice(0, 6)) : [];
  const owned = p?.fleet.filter(f => f.ownership === "OWNED").length ?? 0;
  return <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) setAll(false); }}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2"><span className="readout rounded-sm border border-primary px-1.5 text-sm text-primary">{p?.icao_code ?? icao}</span>{p?.name ?? "Airline dossier"}{p?.is_supporter && <SupporterBadge />}</DialogTitle>
        <DialogDescription className="readout text-xs uppercase">{p ? <>CEO {p.owner} · Main hub {p.hub.icao} ({p.hub.name}) · Fleet {p.fleet.length} ({owned} owned · {p.fleet.length - owned} leased/rented)</> : "Public operations dossier"}</DialogDescription>
      </DialogHeader>
      {isLoading && <p className="py-10 text-center text-muted-foreground">Loading dossier…</p>}
      {!isLoading && !p && <p className="py-10 text-center text-muted-foreground">This airline has no public profile.</p>}
      {p && <>
        <div className="grid gap-4 md:grid-cols-2">
          <ClientOnly fallback={mapFallback}><Suspense fallback={mapFallback}><NetworkMiniMap profile={p} /></Suspense></ClientOnly>
          <div className="space-y-4">
            <section><h3 className="readout mb-2 text-xs uppercase text-amber">Hubs & FBOs</h3>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm"><Star className="h-3.5 w-3.5 text-amber" /><span className="readout">{p.hub.icao}</span><span className="truncate text-muted-foreground">{p.hub.name} · Main hub</span></div>
                {p.bases.map(b => <div key={b.icao} className="flex flex-wrap items-center gap-2 text-sm">
                  <CircleDot className="h-3.5 w-3.5 text-primary" /><span className="readout">{b.icao}</span><span className="truncate text-xs text-muted-foreground">{b.name}</span>
                  {b.fuel && <span className="readout flex items-center gap-1 rounded-sm border border-border px-1.5 text-[10px] uppercase"><Fuel className="h-3 w-3" />Fuel</span>}
                  {b.handling && <span className="readout flex items-center gap-1 rounded-sm border border-border px-1.5 text-[10px] uppercase"><Briefcase className="h-3 w-3" />Handling</span>}
                  {b.maintenance && <span className="readout flex items-center gap-1 rounded-sm border border-border px-1.5 text-[10px] uppercase"><Wrench className="h-3 w-3" />Maint.</span>}
                </div>)}
                {p.bases.length === 0 && <p className="text-xs text-muted-foreground">No satellite FBOs.</p>}
              </div>
            </section>
            <section><h3 className="readout mb-2 text-xs uppercase text-amber">Fleet</h3>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {p.fleet.map(a => <div key={a.registration} className="flex items-center justify-between gap-2 border-b border-border py-1 text-sm">
                  <div className="min-w-0"><span className="readout text-primary">{a.registration}</span> <span className="text-xs text-muted-foreground">{a.model} · {a.ownership.toLowerCase()}</span></div>
                  {a.flight ? <span className="readout flex shrink-0 items-center gap-1 text-xs text-primary"><Plane className="h-3 w-3 animate-pulse" />{a.flight.status === "DISPATCHED" ? "DISPATCHED" : a.flight.status === "DIVERTED" ? "DIVERTED" : "EN ROUTE"} · {a.flight.origin}→{a.flight.destination}</span>
                    : <span className="readout shrink-0 text-xs text-muted-foreground">● {a.location}</span>}
                </div>)}
                {p.fleet.length === 0 && <p className="text-xs text-muted-foreground">No active aircraft.</p>}
              </div>
            </section>
          </div>
        </div>
        <section className="mt-2"><div className="mb-2 flex items-center justify-between"><h3 className="readout text-xs uppercase text-amber">Recent flight log · {flights.length} of {p.flights.length}</h3>
          {p.flights.length > 6 && <Button size="sm" variant="outline" onClick={() => setAll(v => !v)}>{all ? "Show less" : `Show more (${p.flights.length})`}</Button>}</div>
          <div className="divide-y divide-border border-y border-border">
            {flights.map((f, i) => <div key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <div className="readout"><span className="text-primary">{f.flight_number ?? "—"}</span> · {f.origin} → {f.destination} <span className="text-muted-foreground">· {f.distance_nm} NM · {f.registration} {f.model}</span></div>
              <div className="readout text-xs text-muted-foreground">{f.pax}/{f.seats} PAX{f.cargo_kg > 0 ? ` · ${Math.round(f.cargo_kg)} kg` : ""} · {(f.minutes / 60).toFixed(1)} h · <span className={f.status === "COMPLETED" ? "" : "text-primary"}>{f.status.replace("_", " ")}</span> · {new Date(f.date).toLocaleDateString("en-GB")}</div>
            </div>)}
            {p.flights.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No flights yet.</p>}
          </div>
        </section>
        <p className="text-[11px] text-muted-foreground">Public operational data only — no revenue, costs or cash balances are shared.</p>
      </>}
    </DialogContent>
  </Dialog>;
}

export function PublicDossierButton({ icao }: { icao: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}><Eye className="mr-1.5 h-4 w-4" />Public Dossier</Button><CompanyDossier icao={icao} open={open} onOpenChange={setOpen} /></>;
}
