import { displayTerminology } from "@/lib/display-terminology";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Plane, Play, Check, X, Radar, TrendingUp, Navigation } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { operationsQuery, type Quote } from "@/lib/operations";
import { flightAction } from "@/lib/operations.functions";
import { flightProgress, ticketRevenueBreakdown } from "@/lib/dispatch-engine";
import { formatCr } from "@/lib/rules";
import { fleetOverviewQuery } from "@/lib/fleet";
import { fuelLabel, plannedFuel } from "@/lib/fleet-rules";
import { flightNumberSchema } from "@/lib/flight-number";
import { dispatchAirportTiers, sortDestinationDeals, topDestinationDeals, type DealSort } from "@/lib/dispatch-airports";
import { useDispatchDeals } from "@/lib/dispatch-deals";
import { DestinationAlternatives } from "@/components/game/DestinationAlternatives";
import { RouteError } from "@/components/game/RouteError";
import { TierPills } from "@/components/game/TierPills";
import { SimbriefImport } from "@/components/game/SimbriefImport";
import { adminAccessQuery } from '@/lib/admin';
import { acarsLinkLabel, simulationControlsVisible } from '@/lib/acars-status';
import { FlightDebrief } from '@/components/game/FlightDebrief';
export const Route = createFileRoute("/_authenticated/dispatch")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { aircraft?: string | undefined; destination?: string | undefined } => ({
    aircraft: typeof search["aircraft"] === "string" ? search["aircraft"] : undefined,
    destination: typeof search["destination"] === "string" ? search["destination"] : undefined,
  }),
  loader: async ({ context }) => {
    const [d] = await Promise.all([context.queryClient.ensureQueryData(operationsQuery), context.queryClient.ensureQueryData(fleetOverviewQuery)]);
    if (!(d?.company ?? null)) throw redirect({ to: "/onboarding" });
  },
  errorComponent: RouteError,
  head: () => ({
    meta: [
      { title: "Dispatch — SmoothSky" },
      {
        name: "description",
        content: "Plan passenger routes and review flight economics in SmoothSky.",
      },
      { property: "og:title", content: "Dispatch — SmoothSky" },
      {
        property: "og:description",
        content: "Passenger dispatch, flight estimates and settlements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dispatch,
});
function Dispatch() {
  const { data: d } = useSuspenseQuery(operationsQuery);
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const { data: isAdmin = false } = useQuery(adminAccessQuery);
  const qc = useQueryClient();
  const action = useServerFn(flightAction);
  const search = Route.useSearch();
  const [aircraft, setAircraft] = useState(search["aircraft"] ?? "");
  const [destination, setDestination] = useState(search["destination"] ?? "");
  const [flightNumber, setFlightNumber] = useState<string | null>(null);
  const numberValid = flightNumberSchema.safeParse(flightNumber ?? d.nextFlightNumber ?? "").success;
  const [filter, setFilter] = useState("");
  const [explicitTiers, setTiers] = useState<number[] | null>(null);
  const [dealSort, setDealSort] = useState<DealSort>("best");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const webSimAllowed = d.rules["web_simulation_enabled"] === true;
  const [simulation, setSimulation] = useState(webSimAllowed);
  useEffect(() => { if (!webSimAllowed) setSimulation(false); }, [webSimAllowed]);
  const [cargoKg, setCargoKg] = useState(0);
  const [cargoQuoteKg, setCargoQuoteKg] = useState(0);
  const [allCargo, setAllCargo] = useState(false);
  const simulationEnabled = simulation && webSimAllowed;
  const [quoteError, setQuoteError] = useState("");
  const [now, setNow] = useState(d.serverTime);
  const selected =
    d.fleet.find((f) => f.id === aircraft) ?? d.fleet.find((f) => f.status === "AVAILABLE");
  const origin = d.airports.find((a) => a.icao === selected?.location_icao);
  const tiers = dispatchAirportTiers(selected?.type?.tier ?? 1, explicitTiers);
  const rulesKey = JSON.stringify([d.rules, d.bases, overview.rules]);
  const usableRangePct = Number(d.rules["dispatch_usable_range_pct"] ?? 0.75);
  const revenueBreakdown = quote && selected?.type ? ticketRevenueBreakdown(quote.ticket_revenue ?? quote.revenue, quote.passengers, selected.type.tier, quote.rules.charter_by_tier, quote.short_hop_charter, quote.demand?.hub_bonus ?? 0) : null;
  const reserveMinutes = Number(d.rules["fuel_reserve_minutes"]);
  const fuelDensity = Number(selected?.type?.fuel_type === "100LL" ? overview.rules.avgas_kg_per_litre : overview.rules.jeta_kg_per_litre);
  const fuelPlan = quote ? plannedFuel(quote.fuel_gal, reserveMinutes, Number(selected?.type?.fuel_burn_gph ?? 0)) : null;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const cargoBonus = Number(overview.rules.all_cargo_capacity_bonus ?? 0.5);
  const cargoCapacity = Math.floor((selected?.type?.cargo_kg ?? 0) * (allCargo ? 1 + cargoBonus : 1));
  useEffect(() => {
    if (cargoKg > cargoCapacity) setCargoKg(cargoCapacity);
  }, [cargoCapacity, cargoKg]);
  useEffect(() => {
    const t = setTimeout(() => setCargoQuoteKg(cargoKg), 300);
    return () => clearTimeout(t);
  }, [cargoKg]);
  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    if (!selected || !destination) return;
    let active = true;
    action({ data: { action: "quote", aircraft: selected.id, destination, cargoKg: cargoQuoteKg, allCargo } })
      .then((q) => {
        if (active) setQuote(q as Quote);
      })
      .catch((e) => {
        if (active) setQuoteError(displayTerminology(e.message));
      });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.status, destination, action, cargoQuoteKg, allCargo, reserveMinutes, rulesKey]);
  const deals = useDispatchDeals(selected?.status === "AVAILABLE" ? selected.id : undefined, origin?.icao, tiers, filter, cargoQuoteKg, allCargo, rulesKey);
  const destinations = useMemo(() => sortDestinationDeals(tiers.length ? deals.data ?? [] : [], dealSort), [deals.data, dealSort, tiers.length]);
  const topDeals = useMemo(() => topDestinationDeals(destinations), [destinations]);
  async function run(kind: "dispatch" | "start" | "settle" | "cancel", flight?: string) {
    setBusy(true);
    try {
      await action({ data: { action: kind, aircraft: selected?.id, destination, flight, flightNumber: kind === "dispatch" ? (flightNumber ?? d.nextFlightNumber ?? "") : undefined, ...(kind === "dispatch" ? { cargoKg: cargoQuoteKg, allCargo, simulation: simulationEnabled } : {}) } });
      if (kind === "dispatch") {
        setFlightNumber(null);
        setCargoKg(0);
        setCargoQuoteKg(0);
        setAllCargo(false);
        setDestination("");
        setQuote(null);
      }
      await qc.invalidateQueries();
      toast.success(
        kind === "settle"
          ? "Flight settled in Smooth Coins"
          : kind === "start"
            ? "Test flight airborne"
            : kind === "cancel"
              ? "Flight cancelled"
              : simulationEnabled ? "Passengers reserved — ready for departure" : "Flight dispatched — connect your ACARS client",
      );
    } catch (e) {
      toast.error(e instanceof Error ? displayTerminology(e.message) : "Flight action failed");
    } finally {
      setBusy(false);
    }
  }
  if (!d.company) return null;
  return (
    <AppShell company={d.company}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">Operations · Passenger transport</p>
          <h1 className="mt-1 text-3xl font-semibold">Dispatch</h1>
        </div>
        <Button asChild variant="outline">
          <Link to="/radar">
            <Radar className="h-4 w-4" />
            Open radar
          </Link>
        </Button>
      </div>
      {simulationControlsVisible(webSimAllowed, isAdmin) && <div className="mt-5 flex flex-wrap items-center gap-4 border-y border-border py-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={simulationEnabled} onCheckedChange={setSimulation} disabled={!webSimAllowed} />Simulation without ACARS</label>
        <span className="readout text-xs text-amber">{!webSimAllowed ? "ACARS LIVE MODE · web simulation disabled by administrator" : simulationEnabled ? `WEB TEST · ${String(d.rules["simulation_time_scale"])}×` : "ACARS LIVE MODE"}</span>
      </div>}
      <section className="mt-6 border-y border-border py-5">
        <label className="text-xs uppercase text-muted-foreground" htmlFor="dispatch-aircraft">
          Aircraft
        </label>
        <select
          id="dispatch-aircraft"
          className="mt-2 block w-full rounded-sm border border-input bg-panel p-3"
          value={selected?.id ?? ""}
          onChange={(e) => {
            setAircraft(e.target.value);
            setDestination("");
          }}
        >
          <option value="">Select aircraft</option>
          {d.fleet
            .filter((f) => f.status === "AVAILABLE")
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.registration} · {f.type?.model} · {f.location_icao}
              </option>
            ))}
        </select>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-muted-foreground">
          <span>{origin?.name ?? "No available aircraft"}</span>
          <span>{Math.floor((selected?.type?.range_nm ?? 0) * usableRangePct)} NM destination limit · {Math.round(usableRangePct * 100)}% range</span>
          <span>{formatCr(d.balance)} available</span>
        </div>
      </section>
      {d.fleet.length === 0 ? (
        <div className="py-12 text-center">
          <p>No aircraft leased yet.</p>
          <Button asChild className="mt-4">
            <Link to="/market">Lease aircraft</Link>
          </Button>
        </div>
      ) : (
        selected?.status === "AVAILABLE" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <section>
              <label htmlFor="destination-search" className="mb-2 block text-xs uppercase text-muted-foreground">Destinations</label>
              <Input
                id="destination-search"
                aria-label="Search destinations"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="ICAO, airport or city"
              />
              <div className="mt-3"><TierPills tiers={tiers} onChange={setTiers} /></div>
              <div className="mt-3 flex items-center gap-2" role="group" aria-label="Destination sorting">
                <Button size="sm" variant={dealSort === "best" ? "default" : "outline"} aria-pressed={dealSort === "best"} onClick={() => setDealSort("best")}><TrendingUp className="h-3 w-3" />Best Deals</Button>
                <Button size="sm" variant={dealSort === "nearest" ? "default" : "outline"} aria-pressed={dealSort === "nearest"} onClick={() => setDealSort("nearest")}><Navigation className="h-3 w-3" />Nearest</Button>
                {(deals.isFetching || deals.searchPending) && <span className="text-xs text-muted-foreground" role="status">Updating…</span>}
              </div>
              <div aria-label="Destination results" aria-busy={deals.isFetching || deals.searchPending} className="mt-3 max-h-[440px] overflow-y-auto divide-y divide-border">
                {destinations.map((a) => (
                  <Button
                    key={a.icao}
                    variant="ghost"
                    aria-pressed={destination === a.icao}
                    onClick={() => setDestination(a.icao)}
                    className={`h-auto w-full justify-between gap-3 rounded-none py-3 text-left ${destination === a.icao ? "bg-accent" : ""}`}
                  >
                    <span className="min-w-0 whitespace-normal">
                      <span className="flex flex-wrap items-center gap-2"><span className="readout text-primary">{a.icao}</span><span aria-label={`Airport tier ${a.size}`} className={cn(badgeVariants({ variant: "outline" }), "readout shrink-0 rounded-sm border-border bg-muted px-1.5 py-0 text-[10px] leading-4 text-muted-foreground")}>T{a.size}</span>{topDeals.has(a.icao) && <span className="readout text-[10px] text-amber">TOP DEAL</span>}{a.is_fbo && <span className="text-[10px] text-primary">Company FBO</span>}</span>
                      <span className="block whitespace-normal text-xs text-muted-foreground">
                        {a.name}{a.city && ` · ${a.city}`}
                      </span>
                      {a.estimate_error && <span className="mt-1 block text-xs text-amber">{displayTerminology(a.estimate_error)}</span>}
                    </span>
                    <span className="readout shrink-0 text-right text-xs">
                      <span className="block text-muted-foreground">{Math.round(a.distance_nm)} NM</span>
                      <span className={`mt-1 block ${a.estimated_margin !== null && a.estimated_margin >= 0 ? "text-primary" : "text-amber"}`}>{a.estimated_margin === null ? "Est. unavailable" : `Est. ${a.estimated_margin > 0 ? "+" : ""}${formatCr(a.estimated_margin)}`}</span>
                      {a.estimated_revenue !== null && <span className="mt-1 block text-[10px] text-muted-foreground">Income: {formatCr(a.estimated_revenue)}</span>}
                    </span>
                  </Button>
                ))}
                {deals.error && <p role="alert" className="py-4 text-destructive">Airport search unavailable. Please try again.</p>}
                {destinations.length === 0 && (
                  <p className="py-8 text-muted-foreground">{deals.isFetching || deals.searchPending ? "Loading destinations…" : "No matching reachable airports."}</p>
                )}
              </div>
              <div className="mt-4">
                <DestinationAlternatives aircraftId={selected?.id} originIcao={origin?.icao} target={destination} tiers={tiers} cargoKg={cargoQuoteKg} allCargo={allCargo} rulesKey={rulesKey} selectedMargin={quote?.net ?? null} onSelect={setDestination} />
              </div>
            </section>
            <section className="border-t border-border pt-4 lg:border-t-0 lg:pt-0">
              <SimbriefImport
                origin={origin?.icao ?? ""}
                onImport={(plan) => {
                  if (plan.flightNumber && flightNumberSchema.safeParse(plan.flightNumber).success) setFlightNumber(plan.flightNumber);
                  if (plan.destination) setDestination(plan.destination);
                }}
              />
              <label htmlFor="flight-number" className="block text-xs uppercase text-muted-foreground">Flight number</label>
              <Input id="flight-number" className="mb-5 mt-2 readout" value={flightNumber ?? d.nextFlightNumber ?? ""} maxLength={12} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} aria-invalid={!numberValid} />
              {!numberValid && <p role="alert" className="mb-4 text-sm text-destructive">Flight number must contain 3–12 letters or digits and start with a letter.</p>}
              <div className="mb-5 border-y border-border py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="cargo-kg" className="text-xs uppercase text-muted-foreground">Cargo (kg)</label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={allCargo} onCheckedChange={setAllCargo} disabled={!selected?.type?.cargo_kg} aria-label="All-Cargo flight (no passengers)" />
                    All-Cargo (PAX = 0)
                  </label>
                </div>
                <Slider id="cargo-kg" aria-label="Cargo (kg)" className="mt-4" min={0} max={Math.max(cargoCapacity, 0)} step={10} value={[cargoKg]} onValueChange={(v) => setCargoKg(v[0] ?? 0)} disabled={cargoCapacity === 0} />
                <p className="readout mt-2 text-xs text-muted-foreground">
                  {cargoKg} / {cargoCapacity} kg {allCargo ? `· All-Cargo: +${Math.round(cargoBonus * 100)}% capacity, −${Math.round(Number(overview.rules.cargo_airport_fee_discount ?? 0.4) * 100)}% airport fees` : "· Belly cargo"}
                  {cargoCapacity === 0 && " · this aircraft carries no cargo"}
                </p>
              </div>
              <p className="readout text-xs uppercase text-amber">Pre-flight estimate</p>
              <h2 className="mt-2 text-2xl">
                {origin?.icao ?? "—"} → {destination || "—"}
              </h2>
              {quoteError && (
                <p role="alert" className="mt-4 text-destructive">
                  {quoteError}
                </p>
              )}
              {quote ? (
                <>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {quote.passengers} passengers · {quote.cargo_kg ?? 0} kg cargo · {Math.round(quote.distance_nm)} NM ·{" "}
                    {Math.round(quote.minutes)} min
                  </p>
                  {quote.demand && !quote.all_cargo && quote.demand.factor < 1 && <p className="mt-1 text-xs text-amber">Passengers: {quote.passengers}/{quote.demand.raw_passengers} (-{Math.round((1 - quote.demand.factor) * 100)}% local demand to Size {quote.demand.destination_size})</p>}
                  {quote.runway_unpaved && <p className="mt-1 text-xs text-amber">[UNPAVED] No paved runway nearby — remote strip fallback</p>}
                  <dl className="readout mt-5 space-y-3">
                    {[
                      ["Ticket revenue", quote.ticket_revenue ?? quote.revenue],
                      ...((quote.cargo_kg ?? 0) > 0 ? [[`Cargo revenue (${quote.cargo_kg} kg)`, quote.cargo_revenue ?? 0]] : []),
                      ["Fuel", -quote.fuel_cost],
                      ["Landing", -quote.landing_fee],
                      ["Handling fee", -quote.handling_fee],
                      ["Maintenance reserve", -quote.maintenance],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-3 text-sm">
                        <dt className="min-w-0">{label}{label === "Ticket revenue" && revenueBreakdown && quote && (
                          <span className="block text-xs text-muted-foreground">
                            (Distance: {formatCr(revenueBreakdown.distanceRevenue)} at {formatCr(quote.rules.fare_per_nm)}/pax/NM + Tier {selected?.type?.tier} charter: {formatCr(revenueBreakdown.charterRevenue)} at {formatCr(revenueBreakdown.surchargePerPassenger)}/pax{revenueBreakdown.isShortHop && <span className="text-amber"> (-{revenueBreakdown.reductionPercent}% short-hop: {Math.round(quote.distance_nm)} NM / {revenueBreakdown.thresholdNm} NM)</span>}{revenueBreakdown.hubRevenue > 0 && <span className="text-primary"> incl. +{revenueBreakdown.hubPercent}% Hub {destination} bonus: {formatCr(revenueBreakdown.hubRevenue)}</span>})
                          </span>
                        )}{label === "Handling fee" && quote.fob_discounts && (quote.fob_discounts.handling_origin + quote.fob_discounts.handling_destination) > 0 && <span className="block text-xs text-primary">{(quote.fob_discounts.handling_origin + quote.fob_discounts.handling_destination) === 2 ? "Free · Company FBO hubs" : "−50% · Company FBO"}</span>}</dt>
                        <dd className="shrink-0">{formatCr(Number(value))}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-border pt-4">
                      <dt>Contribution margin</dt>
                      <dd className={quote.net >= 0 ? "text-primary" : "text-destructive"}>
                        {formatCr(quote.net)}
                      </dd>
                    </div>
                  </dl>
                  {fuelPlan && <aside aria-label="Fuel planning and billing" className="mt-4 border-y border-border bg-panel px-3 py-4 text-sm">
                    <p className="readout text-xs uppercase text-primary">Fuel · Pay-as-you-burn</p>
                    <p className="mt-2 text-muted-foreground">Only trip consumption is billed at settlement; the safety reserve is not charged. Unused fuel is not carried over or credited towards the next flight in SmoothSky.</p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div><dt className="text-muted-foreground">Estimated trip consumption</dt><dd className="readout mt-1">{fuelLabel(fuelPlan.tripGallons, fuelDensity)}</dd></div>
                      <div><dt className="text-muted-foreground">Required reserve · {reserveMinutes} min</dt><dd className="readout mt-1">{fuelLabel(fuelPlan.reserveGallons, fuelDensity)}</dd></div>
                      <div><dt className="text-primary">Planned fuel including reserve</dt><dd className="readout mt-1 text-primary">{fuelLabel(fuelPlan.plannedGallons, fuelDensity)}</dd></div>
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">Load at least the planned fuel before departure. Compare it with your SimBrief / aircraft EFB block fuel: the same trip-plus-reserve principle applies, but taxi, contingency and alternate requirements may increase the simulator's total. Use the higher requirement; SmoothSky's estimate does not validate your simulator fuel load.</p>
                    <p className="mt-2 text-xs text-muted-foreground">Reserve follows the current administrator setting. Weekly lease costs are excluded from this estimate.</p>
                  </aside>}
                   {quote.fob_discounts && quote.fob_discounts.savings > 0 && <div className="mt-4 border-y border-border py-3 text-xs text-primary"><p className="readout">FBO savings included · {formatCr(quote.fob_discounts.savings)}</p><p className="mt-1">Fuel {quote.fob_discounts.fuel * 100}% · Landing {quote.fob_discounts.landing * 100}% · Handling {quote.fob_discounts.handling_origin * 100}% origin / {quote.fob_discounts.handling_destination * 100}% destination · Maintenance {quote.fob_discounts.maintenance * 100}%</p></div>}
                  <Button
                    className="mt-5 w-full"
                    disabled={
                      busy || (quote.passengers === 0 && (quote.cargo_kg ?? 0) === 0) || !numberValid

                    }
                    onClick={() => run("dispatch")}
                  >
                    <Plane className="h-4 w-4" />
                    Dispatch flight
                  </Button>
                </>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  {destination ? "Calculating…" : "No destination selected"}
                </p>
              )}
            </section>
          </div>
        )
      )}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Flight operations</h2>
        <span className="readout text-xs text-amber">
          {webSimAllowed ? `WEB TEST · ${String(d.rules["simulation_time_scale"])}× · ACARS LIVE` : "ACARS LIVE MODE · real-time telemetry"}
        </span>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {d.flights.map((f) => {
            const acars = f.execution_source === "ACARS_AGENT";
            const progress = acars ? 0 : flightProgress(f, now);
            const live = (f.telemetry as { live?: { altitude_ft?: number; ground_speed_kt?: number; fuel_gal?: number; phase?: string } } | null)?.live;
            const active = f.status === "DISPATCHED" || f.status === "EN_ROUTE";
            return (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <p className="readout text-primary">
                    {f.flight_number} · {f.aircraft?.registration ?? "—"} · {f.origin_icao} → {f.destination_icao}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.passengers} pax{Number((f.estimate as Quote | null)?.cargo_kg ?? 0) > 0 ? ` · ${(f.estimate as Quote).cargo_kg} kg cargo` : ""} · {f.status.replace("_", " ")}
                  </p>
                  {acars && active && (
                    <p className="readout mt-2 text-xs text-amber">
                      {acarsLinkLabel(f.status, f.telemetry, f.departed_at, now)}{live ? ` · ${live.phase ?? ""} · ${Math.round(live.altitude_ft ?? 0)} ft · ${Math.round(live.ground_speed_kt ?? 0)} kt · ${Math.round(live.fuel_gal ?? 0)} gal` : ""}
                    </p>
                  )}
                  {f.status === "EN_ROUTE" && !acars && (
                    <progress
                      aria-label="Flight progress"
                      className="mt-2 h-2 w-48 accent-primary"
                      value={progress}
                      max={1}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.status === "DISPATCHED" && !acars && (
                    <>
                      <Button size="sm" disabled={busy || !simulationEnabled || f.execution_source !== "WEB_MANUAL"} title={!simulationEnabled ? "Web simulation disabled — fly via ACARS" : undefined} onClick={() => run("start", f.id)}>
                        <Play className="h-4 w-4" />
                        Start test flight · {String(d.rules["simulation_time_scale"])}×
                      </Button>
                    </>
                  )}
                  {f.status === "EN_ROUTE" && !acars && (
                    <Button disabled={busy || progress < 1} onClick={() => run("settle", f.id)}>
                      <Check className="h-4 w-4" />
                      {progress < 1
                        ? `${Math.round(progress * 100)}% · En route`
                        : "Complete & settle"}
                    </Button>
                  )}
                  {active && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Cancel flight ${f.flight_number}? The aircraft returns to ${f.origin_icao} and no revenue is paid.`)) void run("cancel", f.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                      Cancel flight
                    </Button>
                  )}
                  {f.status === "COMPLETED" && (
                    <><FlightDebrief flightNumber={f.flight_number} route={`${f.origin_icao} → ${f.destination_icao}`} settlement={f.settlement} /><span className="readout text-primary">
                      {formatCr((f.settlement as Quote)?.net ?? 0)}
                    </span></>
                  )}
                </div>
              </div>
            );
          })}
          {d.flights.length === 0 && (
            <p className="py-8 text-muted-foreground">No flights dispatched yet.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
