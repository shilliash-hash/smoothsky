import { createFileRoute, ClientOnly, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { Plane, X } from "lucide-react";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { operationsQuery, type Airport, type Flight } from "@/lib/operations";
import { projectedPassengers, flightProgress, type Economy } from "@/lib/dispatch-engine";
import { formatCr } from "@/lib/rules";
import { fleetOverviewQuery } from "@/lib/fleet";
import { fuelLabel } from "@/lib/fleet-rules";
import { airportCategories, airportMatches, type AirportCategory } from "@/lib/radar-filters";
import { Checkbox } from "@/components/ui/checkbox";
const RadarMap = lazy(() => import("@/components/game/RadarMap"));
export const Route = createFileRoute("/_authenticated/radar")({
  loader: async ({ context }) => {
    const d = await context.queryClient.ensureQueryData(operationsQuery);
    await context.queryClient.ensureQueryData(fleetOverviewQuery);
    if (!d.company) throw redirect({ to: "/onboarding" });
  },
  head: () => ({
    meta: [
      { title: "Operational radar — SmoothSky" },
      {
        name: "description",
        content: "Explore European airports, aircraft positions and reachable destinations.",
      },
      { property: "og:title", content: "Operational radar — SmoothSky" },
      {
        property: "og:description",
        content: "Your fleet and airport network on an interactive operational map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Radar,
});
function Radar() {
  const { data: d } = useSuspenseQuery(operationsQuery);
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const [selected, setSelected] = useState("__default");
  const [rangeOnly, setRangeOnly] = useState(false);
  const [airport, setAirport] = useState<Airport | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [layers, setLayers] = useState({ pax: true, activity: true, flights: true });
  const [categories, setCategories] = useState<AirportCategory[]>([...airportCategories]);
  const [tiers, setTiers] = useState<number[]>([1,2,3,4,5,6,7]);
  const visible = d.airports.filter(a => airportMatches(a, categories, tiers));
  const onAirport = useCallback((a: Airport) => {
    setAirport(a);
    setFlight(null);
  }, []);
  const onFlight = useCallback((f: Flight) => {
    setFlight(f);
    setAirport(null);
  }, []);
  const metric = d.metrics.find((m) => m.icao === airport?.icao);
  const [now, setNow] = useState(d.serverTime);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!d.company) return null;
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
          {d.flights.filter((f) => f.status === "EN_ROUTE").length} airborne
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
            {key === "pax" ? "Passenger rings" : key === "activity" ? "Activity" : "Airborne"}
          </label>
        ))}
      </div>
      <div className="relative border-y border-border">
        <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-border py-4">
          <fieldset className="flex flex-wrap items-center gap-4"><legend className="mb-2 text-xs uppercase text-muted-foreground">Airport categories</legend>
            <Button size="sm" variant="outline" onClick={() => setCategories([...airportCategories])}>All categories</Button>
            {airportCategories.map(c => <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={categories.includes(c)} onCheckedChange={checked => setCategories(old => checked ? [...old,c] : old.filter(x=>x!==c))} />{c}</label>)}
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-3"><legend className="mb-2 text-xs uppercase text-muted-foreground">Airport Tier / Size</legend>
            <Button size="sm" variant="outline" onClick={() => setTiers([1,2,3,4,5,6,7])}>All tiers</Button>
            {[1,2,3,4,5,6,7].map(t => <label key={t} className="flex items-center gap-1 text-sm"><Checkbox checked={tiers.includes(t)} onCheckedChange={checked => setTiers(old=>checked?[...old,t]:old.filter(x=>x!==t))} />T{t}</label>)}
          </fieldset>
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
              airportFilter={visible.map(a=>a.icao)}
              selected={chosen}
              rangeOnly={rangeOnly}
              layers={layers}
              densities={{ avgas: Number(overview.rules.avgas_kg_per_litre), jeta: Number(overview.rules.jeta_kg_per_litre) }}
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
            Ground fleet / airborne
          </span>
          <span className="text-radar-pax">◔ Passenger pool · % full</span>
          <span className="text-radar-range">◯ Aircraft range</span>
          <span className="text-radar-activity">◎ Pulse · Active airport (7 days)</span>
          <span className="text-amber">⚑ Company FOB</span>
        </div>
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">
        Airports & runways: OurAirports · provisional classification · fuel: SmoothSky simulation
      </p>
      {(airport || flight) && (
        <section
          role="dialog"
          aria-label={airport ? "Airport details" : "Flight details"}
          className="mt-5 border-y border-border py-5"
        >
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {airport
                ? `${airport.icao} · ${airport.name}`
                : `${flight?.flight_number} · ${flight?.aircraft?.registration ?? "—"} · ${flight?.origin_icao} → ${flight?.destination_icao}`}
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
              {d.bases.some(b => b.airport_icao === airport.icao) && <Button asChild variant="outline" className="mt-3"><Link to="/bases">⚑ {d.bases.find(b => b.airport_icao === airport.icao)?.base_type} FOB · Manage base</Link></Button>}
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
            flight && (
              <div className="mt-3 space-y-3">
                <p>
                  {flight.passengers} passengers · {Math.round(flightProgress(flight, now) * 100)}%
                  ·{" "}
                  {flight.execution_source === "WEB_MANUAL"
                    ? "Simulated position"
                    : "ACARS position"}
                </p>
                <progress
                  className="h-2 w-full accent-primary"
                  value={flightProgress(flight, now)}
                  max={1}
                />
                <p className="readout">
                  Estimated contribution{" "}
                  {formatCr(Number((flight.estimate as Record<string, number>)["net"]))}
                </p>
                <Button asChild variant="outline">
                  <Link to="/dispatch">Flight operations</Link>
                </Button>
              </div>
            )
          )}
        </section>
      )}
    </AppShell>
  );
}
