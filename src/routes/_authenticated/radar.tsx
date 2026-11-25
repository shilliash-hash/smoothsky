import { cargoPoolQuery, cargoPoolLabel, cargoPoolLbs } from "@/lib/cargo-pool";
import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { Plane, X } from "lucide-react";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { operationsQuery, type Airport } from "@/lib/operations";
import { radarWorldQuery, radarTierQuery, radarContextQuery, radarPortCodes } from "@/lib/radar-world";
import { projectedPassengers, type Economy } from "@/lib/dispatch-engine";
import { fleetOverviewQuery } from "@/lib/fleet";
import { fuelLabel } from "@/lib/fleet-rules";
import { airportCategories, airportMatches, type AirportCategory } from "@/lib/radar-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { useVisibleTiers } from "@/lib/airport-tiers";
import { TierPills } from "@/components/game/TierPills";
import { RouteError } from "@/components/game/RouteError";
import { acarsLinkLabel } from '@/lib/acars-status';
import { liveRadarQuery, liveRadarProgress, type LiveRadarFlight } from '@/lib/live-radar';
const RadarMap = lazy(() => import("@/components/game/RadarMap"));
export const Route = createFileRoute("/_authenticated/radar")({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(operationsQuery), context.queryClient.ensureQueryData(fleetOverviewQuery), context.queryClient.ensureQueryData(liveRadarQuery)]);
  },
  errorComponent: RouteError,
  head: () => ({
    meta: [
      { title: "Operational radar — SmoothSky" },
      {
        name: "description",
        content: "Track worldwide active SmoothSky flights, live ACARS positions and airport activity.",
      },
      { property: "og:title", content: "Operational radar — SmoothSky" },
      {
        property: "og:description",
        content: "All active SmoothSky airlines and aircraft on a live worldwide operational map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Radar,
});
function Radar() {
  const { data: ownerData } = useSuspenseQuery(operationsQuery);
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const { data: liveFlights, isRefetchError, dataUpdatedAt } = useSuspenseQuery(liveRadarQuery);
  const [tiers, setTiers] = useVisibleTiers();
  const { data: worldActivity = [], isError: worldError } = useQuery(radarWorldQuery);
  const { data: tierAirports = [], isError: tierError } = useQuery(radarTierQuery(tiers));
  const priorityCodes = useMemo(() => radarPortCodes(ownerData.airports.map(a => a.icao), [
    ...liveFlights.flatMap(f => [f.origin_icao, f.destination_icao]),
    ...worldActivity.map(a => a.icao),
  ]), [ownerData.airports, liveFlights, worldActivity]);
  const contextCodes = useMemo(() => radarPortCodes(tierAirports.map(a => a.icao), priorityCodes), [tierAirports, priorityCodes]);
  const { data: endpoints, isError: contextError } = useQuery(radarContextQuery(contextCodes));
  const d = useMemo(() => ({
    ...ownerData,
    airports: [...new Map([...ownerData.airports, ...tierAirports, ...(endpoints?.airports ?? [])].map(a => [a.icao, a])).values()],
    metrics: [...new Map([...ownerData.metrics, ...(endpoints?.metrics ?? [])].map(a => [a.icao, a])).values()],
    pools: [...new Map([...ownerData.pools, ...(endpoints?.pools ?? [])].map(a => [a.airport_icao, a])).values()],
  }), [ownerData, tierAirports, endpoints]);
  const [selected, setSelected] = useState("__default");
  const [rangeOnly, setRangeOnly] = useState(false);
  const [airport, setAirport] = useState<Airport | null>(null);
  const [flight, setFlight] = useState<LiveRadarFlight | null>(null);
  const currentFlight = liveFlights.find(f => f.id === flight?.id) ?? null;
  const [layers, setLayers] = useState({ pax: true, activity: true, flights: true });
  const [categories, setCategories] = useState<AirportCategory[]>([...airportCategories]);
  const visible = useMemo(() => {
    const priority = new Set(priorityCodes);
    return d.airports.filter(a => priority.has(a.icao) || airportMatches(a, categories, tiers));
  }, [d.airports, categories, tiers, priorityCodes]);
  const airportFilter = useMemo(() => visible.map(a => a.icao), [visible]);
  const onAirport = useCallback((a: Airport) => {
    setAirport(a);
    setFlight(null);
  }, []);
  const onFlight = useCallback((f: LiveRadarFlight) => {
    setFlight(f);
    setAirport(null);
  }, []);
  const metric = d.metrics.find((m) => m.icao === airport?.icao);
  const [now, setNow] = useState(d.serverTime);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const chosen = selected === "__default" ? (d.fleet[0]?.id ?? "") : selected;
  const pool = d.pools.find((p) => p.airport_icao === airport?.icao);
  const rules = d.rules as Economy;
  const capacity = airport
    ? Number((rules["airport_capacities"] as number[])[airport.size - 1]) *
      (1 + 0.1 * (airport.development_level - 1))
    : 0;
  const hours = pool ? Math.max(0, (now - Date.parse(pool.updated_at)) / 3600000) : 0;
  const idle = pool
    ? Math.max(
        0,
        (now -
          Math.max(
            Date.parse(pool.updated_at),
            Date.parse(pool.last_departure_at) + Number(rules["burnout_idle_hours"]) * 3600000,
          )) /
          3600000,
      )
    : 0;
  const stock = pool
    ? projectedPassengers(Number(pool.stock), capacity, hours, idle, rules)
    : capacity * Number(rules["initial_stock"]);
  return (
    <AppShell company={d.company}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">Fleet & World · Live operations</p>
          <h1 className="mt-1 text-3xl font-semibold">Operational radar</h1>
        </div>
        <span className="readout text-xs text-muted-foreground">
          {visible.length.toLocaleString()} / {d.airports.length.toLocaleString()} airports ·{" "}
          {liveFlights.filter((f) => f.status === "EN_ROUTE").length} airborne · {liveFlights.filter(f => f.status === "DISPATCHED").length} dispatched
        </span>
      </div>
      <div className="my-5 flex flex-wrap items-center gap-4">
        <select
          aria-label="Radar aircraft"
          className="min-w-0 max-w-full rounded-sm border border-input bg-panel p-2 text-sm"
          value={chosen}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">All aircraft</option>
          {d.fleet.map((f) => (
            <option key={f.id} value={f.id}>
              {f.registration} · {f.type?.range_nm} NM · {f.location_icao}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={rangeOnly} onCheckedChange={setRangeOnly} disabled={!chosen} />
          Within aircraft range
        </label>
        {(["pax", "activity", "flights"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <Switch
              checked={layers[key]}
              onCheckedChange={(value) => setLayers((current) => ({ ...current, [key]: value }))}
            />
            {key === "pax" ? "Passenger rings" : key === "activity" ? "Activity" : "Live flights"}
          </label>
        ))}
      </div>
      <div className="relative border-y border-border">
        {(worldError || tierError || contextError) && <p role="alert" className="py-2 text-sm text-amber">Airport update unavailable — retrying with last received data.</p>}
        <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-border py-4">
          <fieldset className="flex flex-wrap items-center gap-4"><legend className="mb-2 text-xs uppercase text-muted-foreground">Airport categories</legend>
            <Button size="sm" variant="outline" onClick={() => setCategories([...airportCategories])}>All categories</Button>
            {airportCategories.map(c => <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={categories.includes(c)} onCheckedChange={checked => setCategories(old => checked ? [...old,c] : old.filter(x=>x!==c))} />{c}</label>)}
          </fieldset>
          <TierPills tiers={tiers} onChange={setTiers} />
        </div>
        <ClientOnly
          fallback={
            <div className="flex h-[600px] items-center justify-center text-muted-foreground">
              Loading radar…
            </div>
          }
        >
          <Suspense fallback={<div className="h-[600px]">Loading map…</div>}>
            <RadarMap
              data={d}
              flights={liveFlights}
              worldActivity={worldActivity}
              focusedFlight={flight?.id ?? null}
              airportFilter={airportFilter}
              selected={chosen}
              rangeOnly={rangeOnly}
              layers={layers}
              densities={{ avgas: Number(overview.rules.avgas_kg_per_litre), jeta: Number(overview.rules.jeta_kg_per_litre) }}
              usableRangePct={1}
              onAirport={onAirport}
              onFlight={onFlight}
            />
          </Suspense>
        </ClientOnly>
        <div className="radar-legend flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-panel px-4 py-3 text-xs">
          <span className="readout uppercase text-muted-foreground">Legend</span>
          <span className="flex items-center gap-2">
            <i className="h-2 w-2 rounded-full bg-primary" />
            Airport
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2 w-2 rounded-full bg-amber" />
            Ground fleet / world flights
          </span>
          <span className="text-primary">✈ Your flight</span>
          <span className="text-radar-pax">◔ Passenger pool · % full</span>
          <span className="flex items-center gap-2 text-radar-range">
            <i aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-current" />
            Max range · payload reduced by MTOW
          </span>
          <span className="text-radar-activity">◎ Pulse · Active airport (7 days)</span>
          <span className="text-amber">⚑ Company FBO</span>
        </div>
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">
        Airports & runways: OurAirports · provisional classification · fuel: SmoothSky simulation
      </p>
      <section className="mt-6 border-y border-border py-5" aria-label="Worldwide active flights">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Worldwide active flights <span className="readout text-sm text-amber">{liveFlights.length}</span></h2>
          <span className="readout text-xs text-muted-foreground">Updated {new Date(dataUpdatedAt).toLocaleTimeString()} · 5s refresh</span>
        </div>
        {isRefetchError && <p role="alert" className="mb-3 text-sm text-amber">Live update unavailable — showing last received flights. Retrying…</p>}
        {liveFlights.length === 0 ? <p className="text-sm text-muted-foreground">No active flights worldwide.</p> :
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {liveFlights.map(f => <Button key={f.id} variant="ghost" onClick={() => onFlight(f)} className={`h-auto w-full justify-start whitespace-normal rounded-none py-3 text-left ${f.is_own ? 'text-primary' : ''}`}>
              <Plane className="mr-3 h-5 w-5 shrink-0" />
              <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-3">
                <span className="min-w-0 break-words"><span className="readout">{f.flight_number}</span> · {f.airline_name}{f.is_own && <span className="ml-2 text-xs text-primary">YOUR FLIGHT</span>}</span>
                <span className="readout text-xs">{f.origin_icao} → {f.destination_icao}<span className="block text-muted-foreground">{f.registration} · {f.aircraft_model}</span></span>
                <span className="text-xs text-muted-foreground">{f.status === 'DISPATCHED' ? 'DISPATCHED · Awaiting departure' : f.execution_source === 'ACARS_AGENT' ? acarsLinkLabel(f.status, { live: { received_at: f.last_telemetry_at } }, f.departed_at, now).replace(' — use Cancel flight', '') : 'EN ROUTE · Simulated'}{f.eta_at && <span className="block">ETA {new Date(f.eta_at).toLocaleTimeString()}</span>}</span>
              </span>
            </Button>)}
          </div>}
      </section>
      {(airport || currentFlight) && (
        <section
          role="dialog"
          aria-label={airport ? "Airport details" : "Flight details"}
          className="mt-5 border-y border-border py-5"
        >
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {airport
                ? `${airport.icao} · ${airport.name}`
                : `${currentFlight?.flight_number} · ${currentFlight?.registration ?? "—"} · ${currentFlight?.origin_icao} → ${currentFlight?.destination_icao}`}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close details"
              onClick={() => {
                setAirport(null);
                setFlight(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {airport ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {airport.city} · {airport.country} · {airport.airport_type.replaceAll("_", " ")}
              </p>
              {d.bases.some(b => b.airport_icao === airport.icao) && <Button asChild variant="outline" className="mt-3"><Link to="/bases">⚑ {d.bases.find(b => b.airport_icao === airport.icao)?.base_type} FBO · Manage base</Link></Button>}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Size / Development</dt>
                  <dd>
                    {airport.size} / {airport.development_level} · provisional
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Runway</dt>
                  <dd>
                    {airport.longest_runway_ft ?? "Unknown"} ft ·{" "}
                    {airport.runway_surface ?? "Unknown surface"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Elevation</dt>
                  <dd>{airport.elevation_ft ?? "Unknown"} ft</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">100LL · simulated supply</dt>
                  <dd>
                    {Math.floor(Number(metric?.avgas_stock ?? 0)).toLocaleString()} /{" "}
                    {Math.round(Number(metric?.avgas_capacity ?? 0)).toLocaleString()} US gal
                    <div className="text-xs text-muted-foreground">{fuelLabel(Number(metric?.avgas_stock ?? 0), Number(overview.rules.avgas_kg_per_litre))}</div>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Passenger pool</dt>
                  <dd>
                    {Math.floor(stock)} / {Math.round(capacity)} pax
                  </dd>
                </div>
                <CargoPoolTile icao={airport.icao} />
                <div>
                  <dt className="text-muted-foreground">Jet-A1 · simulated supply</dt>
                  <dd>
                    {Math.floor(Number(metric?.jeta_stock ?? 0)).toLocaleString()} /{" "}
                    {Math.round(Number(metric?.jeta_capacity ?? 0)).toLocaleString()} US gal
                    <div className="text-xs text-muted-foreground">{fuelLabel(Number(metric?.jeta_stock ?? 0), Number(overview.rules.jeta_kg_per_litre))}</div>
                  </dd>
                </div>
              </dl>
              {d.fleet
                .filter((f) => f.location_icao === airport.icao && f.status === "AVAILABLE")
                .map((f) => (
                  <div
                    key={f.id}
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
                  >
                    <span className="readout text-primary">
                      {f.registration} · {f.type?.model}
                    </span>
                    <Button asChild size="sm">
                      <Link to="/dispatch" search={{ aircraft: f.id }}>
                        <Plane className="h-4 w-4" />
                        Plan dispatch
                      </Link>
                    </Button>
                  </div>
                ))}
              {chosen && (
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/dispatch" search={{ aircraft: chosen, destination: airport.icao }}>
                    Plan route to {airport.icao}
                  </Link>
                </Button>
              )}
            </>
          ) : (
            currentFlight && (
              <div className="mt-3 space-y-3">
                <p className="text-lg text-primary">{currentFlight.airline_name}{currentFlight.is_own && <span className="ml-3 readout text-xs">YOUR FLIGHT</span>}</p>
                <p className="text-sm text-muted-foreground">{currentFlight.aircraft_model} · {currentFlight.registration} · {currentFlight.status}</p>
                {currentFlight.execution_source === 'ACARS_AGENT' ? <>
                  <p className="readout text-amber">{acarsLinkLabel(currentFlight.status, { live: { received_at: currentFlight.last_telemetry_at } }, currentFlight.departed_at, now).replace(' — use Cancel flight', '')}</p>
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div><dt className="text-muted-foreground">Altitude</dt><dd>{currentFlight.last_altitude_ft == null ? '—' : `${Math.round(currentFlight.last_altitude_ft).toLocaleString()} ft`}</dd></div>
                    <div><dt className="text-muted-foreground">Ground speed / Heading</dt><dd>{currentFlight.last_groundspeed_kts ?? '—'} kt · {currentFlight.last_heading ?? '—'}°</dd></div>
                    <div><dt className="text-muted-foreground">Last telemetry</dt><dd>{currentFlight.last_telemetry_at ? new Date(currentFlight.last_telemetry_at).toLocaleTimeString() : 'Awaiting GPS'}</dd></div>
                  </dl>
                </> : <>
                  <p className="readout">{currentFlight.status === 'DISPATCHED' ? 'Awaiting departure' : `Simulated position · ${Math.round(liveRadarProgress(currentFlight, now) * 100)}%`}</p>
                  <progress className="h-2 w-full accent-primary" value={liveRadarProgress(currentFlight, now)} max={1} />
                </>}
                <p className="readout text-sm text-muted-foreground">Departure {currentFlight.departed_at ? new Date(currentFlight.departed_at).toLocaleTimeString() : 'Pending'} · ETA {currentFlight.eta_at ? new Date(currentFlight.eta_at).toLocaleTimeString() : 'After departure'}</p>
                {currentFlight.is_own && <Button asChild variant="outline"><Link to="/dispatch">Flight operations</Link></Button>}
              </div>
            )
          )}
        </section>
      )}
    </AppShell>
  );
}

function CargoPoolTile({ icao }: { icao: string }) {
  const { data, isError } = useQuery(cargoPoolQuery(icao));
  return (
    <div>
      <dt className="text-muted-foreground">Cargo pool</dt>
      <dd>
        {data ? cargoPoolLabel(data) : isError ? "Unavailable" : "Loading…"}
        {data && <div className="text-xs text-muted-foreground">{cargoPoolLbs(data)}</div>}
      </dd>
    </div>
  );
}
