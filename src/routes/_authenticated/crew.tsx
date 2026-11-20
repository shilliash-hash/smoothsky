import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Plane, Play, Check, X } from "lucide-react";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { distanceNm } from "@/lib/dispatch-engine";
import { formatCr } from "@/lib/rules";
import { getPilotOps, pilotFlight, type PilotAircraft } from "@/lib/pilot.functions";

export const Route = createFileRoute("/_authenticated/crew")({
  head: () => ({ meta: [
    { title: "Crew operations — SmoothSky" },
    { name: "description", content: "Fly roster, freelance and personal aircraft as a SmoothSky pilot and earn commission." },
    { property: "og:title", content: "Crew operations — SmoothSky" },
    { property: "og:description", content: "Reserve airline aircraft, dispatch flights and earn your pilot share." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Crew,
});

type Airport = { icao: string; name: string; city: string; lat: number; lon: number; longest_runway_ft: number | null };
const airportsQuery = { queryKey: ["airports-lite"], staleTime: 3_600_000, queryFn: async () => {
  const out: Airport[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await supabase.from("airports").select("icao,name,city,lat,lon,longest_runway_ft").order("icao").range(o, o + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
} };
const modeLabel = { ROSTER: "Roster", FREELANCE: "Freelance", PERSONAL: "Personal" } as const;

function Crew() {
  const qc = useQueryClient();
  const load = useServerFn(getPilotOps);
  const act = useServerFn(pilotFlight);
  const { data: ops, refetch } = useQuery({ queryKey: ["pilot-ops"], queryFn: () => load(), refetchInterval: 15_000 });
  const { data: airports = [] } = useQuery(airportsQuery);
  const [selectedId, setSelectedId] = useState("");
  const [destination, setDestination] = useState("");
  const [filter, setFilter] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [quote, setQuote] = useState<Record<string, string | number | boolean | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [guideHidden, setGuideHidden] = useState(false);
  useEffect(() => { try { setGuideHidden(localStorage.getItem('smoothsky_crew_guide_hidden') === 'true'); } catch {} }, []);
  function toggleGuide() {
    setGuideHidden(!guideHidden);
    try { localStorage.setItem('smoothsky_crew_guide_hidden', String(!guideHidden)); } catch {}
  }
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const selected = ops?.aircraft.find(a => a.id === selectedId) ?? ops?.aircraft.find(a => a.reserved_by_me);
  const origin = airports.find(a => a.icao === selected?.location_icao);
  const destinations = useMemo(() => !origin || !selected ? [] : airports
    .filter(a => a.icao !== origin.icao && (!a.longest_runway_ft || a.longest_runway_ft >= selected.minimum_runway_ft)
      && [a.icao, a.name, a.city].some(v => v.toLowerCase().includes(filter.toLowerCase())))
    .map(a => ({ ...a, nm: distanceNm(origin, a) })).filter(a => a.nm <= selected.range_nm)
    .sort((a, b) => a.nm - b.nm).slice(0, 60), [airports, origin, selected, filter]);

  useEffect(() => {
    setQuote(null);
    if (!selected?.reserved_by_me || !destination) return;
    let live = true;
    act({ data: { action: "quote", aircraft: selected.id, destination } }).then(q => live && setQuote(q)).catch(e => live && toast.error(e.message));
    return () => { live = false; };
  }, [selected?.id, selected?.reserved_by_me, destination, act]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await refetch(); await qc.invalidateQueries({ queryKey: ["career"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  if (ops && ops.career_role !== "PILOT_ONLY") return <AppShell company={null}>
    <h1 className="text-3xl font-semibold">Crew operations</h1>
    <p className="mt-3 text-muted-foreground">Crew operations are for Pilot Only careers. Airline owners dispatch their own fleet in Dispatch.</p>
  </AppShell>;

  const active = ops?.flights.filter(f => f.status === "DISPATCHED" || f.status === "EN_ROUTE") ?? [];
  const done = ops?.flights.filter(f => f.status === "COMPLETED") ?? [];
  const groups: PilotAircraft["mode"][] = ["PERSONAL", "ROSTER", "FREELANCE"];

  return <AppShell company={null}>
    <p className="readout flex items-center gap-2 text-xs uppercase text-amber"><Plane className="h-4 w-4" /> Crew room</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-3xl font-semibold">Crew operations</h1>
      <div className="text-right"><p className="text-xs uppercase text-muted-foreground">Pilot wallet</p><p className="readout text-2xl">{formatCr(Number(ops?.balance ?? 0))}</p></div>
    </div>

    <section className="mt-5 border-y border-border py-3">
      <div className="flex items-center justify-between gap-3"><h2 className="readout text-xs uppercase text-amber">How it works</h2><Button size="sm" variant="ghost" onClick={toggleGuide} aria-expanded={!guideHidden}>{guideHidden ? 'Show' : 'Hide'}</Button></div>
      {!guideHidden && <ol className="mt-2 grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
        <li><span className="readout text-primary">01</span> Reserve an available aircraft (locks it for you temporarily).</li>
        <li><span className="readout text-primary">02</span> Choose any destination within range in the Dispatch panel and click Dispatch flight.</li>
        <li><span className="readout text-primary">03</span> Fly via SmoothSky ACARS and click Send PIREP after parking to collect your commission.</li>
      </ol>}
    </section>
    <div className="mt-6 grid gap-6 lg:grid-cols-5">
      <div className="instrument p-5 lg:col-span-3">
        <p className="text-xs uppercase text-muted-foreground">Available aircraft</p>
        {ops && ops.aircraft.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No aircraft open to you. Sign a roster contract or check freelance airlines in your profile, or buy a personal aircraft.</p>}
        {groups.map(g => { const list = ops?.aircraft.filter(a => a.mode === g) ?? []; if (!list.length) return null; return <div key={g} className="mt-4">
          <p className="readout text-xs text-primary">{modeLabel[g]}{g === "FREELANCE" ? " job board" : ""}</p>
          <ul className="mt-2 divide-y divide-border">{list.map(a => <li key={a.id} className={`flex flex-wrap items-center justify-between gap-3 py-2 ${selected?.id === a.id ? "bg-primary/5" : ""}`}>
            <button type="button" className="text-left" onClick={() => { setSelectedId(a.id); setDestination(""); }}>
              <span className="readout text-primary">{a.registration}</span> <span className="text-sm">{a.model}</span> <span className="text-xs text-muted-foreground">T{a.tier}</span>
              <div className="text-xs text-muted-foreground">{a.company_name} · at {a.location_icao} · {a.pax} pax · {a.range_nm} NM · {a.mode === "PERSONAL" ? "100% yours" : `${a.commission_pct}% commission`}</div>
            </button>
            {!a.rated ? <span className="readout flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Tier {a.tier} rating</span>
              : a.status !== "AVAILABLE" ? <span className="readout text-xs text-muted-foreground">{a.status}</span>
              : a.reserved_by_other ? <span className="readout text-xs text-amber">RESERVED</span>
              : a.reserved_by_me ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => act({ data: { action: "release" } }), "Reservation released")}>Release</Button>
              : <Button size="sm" disabled={busy} onClick={() => { setSelectedId(a.id); run(() => act({ data: { action: "reserve", aircraft: a.id } }), `${a.registration} reserved`); }}>Reserve</Button>}
          </li>)}</ul>
        </div>; })}
      </div>

      <div className="instrument p-5 lg:col-span-2">
        <p className="text-xs uppercase text-muted-foreground">Dispatch</p>
        {!selected?.reserved_by_me ? <p className="mt-3 text-sm text-muted-foreground">Reserve an aircraft to plan a flight. Reservations hold the aircraft for you for a limited time.</p> : <>
          <p className="mt-2"><span className="readout text-primary">{selected.registration}</span> from <span className="readout">{selected.location_icao}</span> <span className="text-xs text-muted-foreground">until {selected.reserved_until ? new Date(selected.reserved_until).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}</span></p>
          <Input className="mt-3" placeholder="Search destination" value={filter} onChange={e => setFilter(e.target.value)} />
          <ul className="mt-2 max-h-56 overflow-auto rounded-sm border border-border text-sm">{destinations.map(a => <li key={a.icao}>
            <button type="button" onClick={() => setDestination(a.icao)} className={`flex w-full justify-between px-2 py-1 text-left hover:bg-primary/10 ${destination === a.icao ? "bg-primary/15" : ""}`}><span><span className="readout">{a.icao}</span> {a.name}</span><span className="readout text-xs text-muted-foreground">{Math.round(a.nm)} NM</span></button>
          </li>)}</ul>
          {quote && <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Passengers</dt><dd className="readout text-right">{quote["passengers"]}</dd>
            <dt className="text-muted-foreground">Ticket revenue</dt><dd className="readout text-right">{formatCr(Number(quote["revenue"]))}</dd>
            <dt className="text-muted-foreground">Operating costs</dt><dd className="readout text-right">−{formatCr(Number(quote["operating_costs"]))}</dd>
            <dt className="text-muted-foreground">Flight net</dt><dd className="readout text-right">{formatCr(Number(quote["net"]))}</dd>
            <dt className="font-semibold">Your share {quote["pilot_mode"] !== "PERSONAL" && `(${quote["commission_pct"]}%)`}</dt><dd className={`readout text-right font-semibold ${Number(quote["pilot_share"]) >= 0 ? "text-primary" : "text-destructive"}`}>{formatCr(Number(quote["pilot_share"]))}</dd>
          </dl>}
          {quote?.["pilot_mode"] === "PERSONAL" && <p className="mt-2 text-xs text-muted-foreground">Operating costs are paid from your wallet at dispatch and refunded if you cancel.</p>}
          <Input className="mt-3" placeholder="Flight number (optional)" value={flightNumber} onChange={e => setFlightNumber(e.target.value.toUpperCase())} />
          <Button className="mt-3 w-full" disabled={busy || !quote || Number(quote["passengers"]) <= 0} onClick={() => run(async () => { await act({ data: { action: "dispatch", aircraft: selected.id, destination, flightNumber: flightNumber || undefined } }); setDestination(""); setFlightNumber(""); setQuote(null); }, "Flight dispatched")}>Dispatch</Button>
        </>}
      </div>
    </div>

    <div className="instrument mt-6 p-5">
      <p className="text-xs uppercase text-muted-foreground">Active flights</p>
      {active.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No active flights.</p>}
      <ul className="mt-2 divide-y divide-border">{active.map(f => {
        const eta = f.departed_at ? new Date(f.departed_at).getTime() + (f.estimated_minutes * 60_000) / Math.max(1, Number(f.time_scale ?? 1)) : null;
        const arrived = eta !== null && now >= eta;
        return <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div><span className="readout text-primary">{f.flight_number}</span> · {f.registration} · {f.origin_icao} → {f.destination_icao} <span className="text-xs text-muted-foreground">({modeLabel[f.mode]}, {f.passengers} pax)</span>
            {eta && !arrived && <div className="readout text-xs text-muted-foreground">Arrives in {Math.ceil((eta - now) / 1000)} s</div>}</div>
          <div className="flex gap-2">
            {f.status === "DISPATCHED" && <><Button size="sm" disabled={busy} onClick={() => run(() => act({ data: { action: "start", flight: f.id } }), "Test flight started")}><Play className="h-3.5 w-3.5" /> Fly (test)</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => act({ data: { action: "cancel", flight: f.id } }), "Flight cancelled")}><X className="h-3.5 w-3.5" /> Cancel</Button></>}
            {f.status === "EN_ROUTE" && <Button size="sm" disabled={busy || !arrived} onClick={() => run(() => act({ data: { action: "settle", flight: f.id } }), "Flight completed")}><Check className="h-3.5 w-3.5" /> Complete</Button>}
          </div>
        </li>; })}</ul>
    </div>

    <div className="instrument mt-6 overflow-x-auto p-5">
      <p className="text-xs uppercase text-muted-foreground">Completed pilot flights</p>
      <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Landed</th><th>Flight</th><th>Aircraft</th><th>Route</th><th>Mode</th><th className="text-right">Flight net</th><th className="text-right">Your share</th></tr></thead>
        <tbody>{done.map(f => { const net = Number(f.net ?? 0); const share = f.mode === "PERSONAL" ? net : Math.max(0, Math.round(net * Number(f.commission_pct ?? 0)) / 100); return <tr key={f.id} className="border-t border-border">
          <td className="py-1 readout text-xs">{f.completed_at ? new Date(f.completed_at).toISOString().slice(0, 16).replace("T", " ") : ""}</td>
          <td className="readout text-primary">{f.flight_number}</td><td>{f.registration}</td><td>{f.origin_icao} → {f.destination_icao}</td><td>{modeLabel[f.mode]}</td>
          <td className="readout text-right">{formatCr(net)}</td><td className={`readout text-right ${share >= 0 ? "text-primary" : "text-destructive"}`}>{formatCr(share)}</td>
        </tr>; })}</tbody></table>
      {done.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No completed flights yet.</p>}
    </div>
  </AppShell>;
}
