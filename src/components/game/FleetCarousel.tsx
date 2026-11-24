import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCr } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { arrangeFleet, isAirborne, type FleetFilter } from "@/lib/fleet-carousel";
import { operationalBoardQuery } from "@/lib/game";
import { FlightBriefing } from "./FlightBriefing";

type Aircraft = { id: string; registration: string; status: string; location_icao: string; ownership: string; purchase_price: number | null; weekly_rate: number; next_payment_due: string; type?: { manufacturer: string; model: string } | null };
const pills: { id: FleetFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "available", label: "Available" }, { id: "flight", label: "In Flight" }, { id: "sale", label: "For Sale" }];
const statusLabel: Record<string, string> = { AVAILABLE: "Available", EN_ROUTE: "In flight", DISPATCHED: "Dispatched", DIVERTED: "Diverted", RESERVED: "Reserved" };

export function FleetCarousel({ companyId, fleet, contractEnd, onSelect, compact = false }: { companyId: string; fleet: Aircraft[]; contractEnd: (id: string) => string | undefined; onSelect: (id: string) => void; compact?: boolean }) {
  const { data: listed = [] } = useQuery({ queryKey: ["fleet-listings", companyId], enabled: !!companyId, queryFn: async () => {
    const { data, error } = await supabase.from("used_aircraft_listings").select("fleet_aircraft_id").eq("seller_company_id", companyId).eq("status", "ACTIVE");
    if (error) throw error; return data.map(r => r.fleet_aircraft_id).filter((x): x is string => !!x);
  } });
  const forSale = useMemo(() => new Set(listed), [listed]);
  // Shares the dashboard's polled operational board cache to find each aircraft's active flight.
  const { data: board } = useQuery(operationalBoardQuery(companyId));
  const activeFlight = useMemo(() => new Map((board?.active ?? []).map(fl => [fl.aircraft_id, fl.id] as const)), [board]);
  const [filter, setFilter] = useState<FleetFilter>("all");
  const items = useMemo(() => arrangeFleet(fleet, filter, forSale), [fleet, filter, forSale]);
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ first: 0, perView: 1, atEnd: true });
  const measure = () => { const el = ref.current; const card = el?.firstElementChild as HTMLElement | null; if (!el || !card) return setView({ first: 0, perView: 1, atEnd: true }); const w = card.offsetWidth + 12; setView({ first: Math.round(el.scrollLeft / w), perView: Math.max(1, Math.round(el.clientWidth / w)), atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 }); };
  useEffect(() => { ref.current?.scrollTo({ left: 0 }); measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [items.length, filter]);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth, behavior: "smooth" });
  const onWheel = (e: React.WheelEvent) => { const el = ref.current; if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) { const max = el.scrollWidth - el.clientWidth; if ((e.deltaY > 0 && el.scrollLeft < max) || (e.deltaY < 0 && el.scrollLeft > 0)) { e.preventDefault(); el.scrollLeft += e.deltaY; } } };
  const last = Math.min(items.length, view.first + view.perView);
  const pages = Math.max(1, Math.ceil(items.length / view.perView));
  const page = Math.min(pages - 1, Math.ceil(view.first / view.perView));
  return <div className="mt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fleet status filter">
        {pills.map(p => <Button key={p.id} size="sm" variant={filter === p.id ? "secondary" : "ghost"} aria-pressed={filter === p.id} onClick={() => setFilter(p.id)} className="h-8 px-2 text-xs">{p.label}</Button>)}
      </div>
      <div className="flex items-center gap-2">
        <span className="readout text-xs text-muted-foreground">{items.length ? `${view.first + 1}–${last}` : "0"} / {items.length}</span>
        <Button size="icon" variant="outline" className="h-7 w-7 hover:border-primary hover:text-primary" aria-label="Previous aircraft" disabled={view.first === 0} onClick={() => scroll(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" className="h-7 w-7 hover:border-primary hover:text-primary" aria-label="Next aircraft" disabled={view.atEnd} onClick={() => scroll(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
    {items.length === 0 ? <p className="mt-3 border-y border-border py-6 text-center text-sm text-muted-foreground">No aircraft match this filter.</p> : <div className="relative mt-3">
      <div ref={ref} onScroll={measure} onWheel={onWheel} className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(f => <div key={f.id} className={`instrument w-full shrink-0 snap-start p-4 ${compact ? "" : "md:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]"}`}>
          <Button variant="ghost" aria-label={`Aircraft accounts ${f.registration}`} onClick={() => onSelect(f.id)} className="block h-auto w-full p-0 text-left font-normal whitespace-normal">
          <div className="flex items-center justify-between gap-2">
            <span className="readout text-lg text-primary">{f.registration}</span>
            <span className="flex gap-1">{forSale.has(f.id) && <span className="rounded-sm bg-amber/15 px-2 py-0.5 text-xs text-amber">For sale</span>}<span className={`rounded-sm px-2 py-0.5 text-xs ${f.status === "DIVERTED" ? "bg-amber/15 text-amber" : isAirborne(f.status) ? "bg-primary/15 text-primary" : f.status === "AVAILABLE" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{statusLabel[f.status] ?? f.status}</span></span>
          </div>
          <p className="mt-1 text-sm">{f.type?.manufacturer} {f.type?.model}</p>
          <dl className="readout mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            <dt>Location</dt><dd className="text-right text-foreground">{f.location_icao}</dd>
            {f.ownership === "RENTAL" ? <><dt className="col-span-2 text-amber">SPOT RENTAL · 1 FLIGHT</dt><dt>Weekly commitments</dt><dd className="text-right">None</dd></> : f.ownership === "OWNED" ? <><dt>Ownership</dt><dd className="text-right text-primary">Owned</dd><dt>Asset value</dt><dd className="text-right">{formatCr(f.purchase_price ?? 0)}</dd></> : <><dt>Weekly rate</dt><dd className="text-right text-amber">{formatCr(f.weekly_rate)}</dd>
              <dt>Contract ends</dt><dd className="text-right text-foreground">{new Date(contractEnd(f.id) ?? f.next_payment_due).toLocaleDateString("en-US")}</dd>
              <dt>Next payment</dt><dd className="text-right text-foreground">{new Date(f.next_payment_due).toLocaleDateString("en-US")}</dd></>}
          </dl>
          </Button>
          {(activeFlight.has(f.id) || f.status === "DIVERTED") && <div className="mt-3 flex flex-wrap gap-2">
            {activeFlight.has(f.id) && <FlightBriefing flightId={activeFlight.get(f.id) ?? ""} label="Flight plan" className="flex-1" />}
            {f.status === "DIVERTED" && <Button asChild variant="outline" size="sm" className="h-auto flex-1 whitespace-normal py-2 text-amber"><Link to="/dispatch" search={{ aircraft: f.id }}><Navigation className="h-4 w-4" />Resolve in Dispatch</Link></Button>}
          </div>}
        </div>)}
      </div>
      {!view.atEnd && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />}
    </div>}
    {pages > 1 && <div className="mt-3 flex justify-center gap-1.5" aria-hidden>{Array.from({ length: pages }, (_, i) => <span key={i} className={`h-1 rounded-full transition-all ${i === page ? "w-6 bg-primary" : "w-2 bg-border"}`} />)}</div>}
  </div>;
}
