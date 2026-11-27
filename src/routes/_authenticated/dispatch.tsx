import { displayTerminology } from "@/lib/display-terminology";
import { createFileRoute, Link, redirect, ClientOnly } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { RouteWaypoint } from "@/lib/route-waypoints";
import { Plane, Play, Check, X, Radar, TrendingUp, Navigation } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { bestPayloadMix, payloadPlanning } from "@/lib/payload-planning";
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
import type { SimbriefPlan } from "@/lib/pilot.functions";
import { simbriefRampToGallons } from "@/lib/fuel-units";
import { adminAccessQuery } from '@/lib/admin';
import { acarsLinkLabel, simulationControlsVisible } from '@/lib/acars-status';
import { FlightDebrief } from '@/components/game/FlightDebrief';
import { FlightBriefing } from '@/components/game/FlightBriefing';
import { FuelTankPanel } from "@/components/game/FuelTankPanel";
import { WeightBalancePanel } from "@/components/game/WeightBalancePanel";
import { InfoHint } from "@/components/game/InfoHint";
import { CorridorSaturationBadge } from "@/components/game/CorridorSaturationBadge";
import { FlightModeSelector } from '@/components/game/FlightModeSelector';
import { DivertControls } from '@/components/game/DivertControls';
import { ContinuationFuelNotice } from '@/components/game/ContinuationFuelNotice';
import { RecallFlightButton } from '@/components/game/RecallFlightButton';
const RoutePreviewMap = lazy(() => import("@/components/game/RoutePreviewMap"));
import { canDispatchPayload, commercialRangeError, flightModePayload, flightModeRange, type FlightMode } from '@/lib/flight-mode';
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
  useEffect(() => { if (search.aircraft) setAircraft(search.aircraft); }, [search.aircraft]);
  useEffect(() => {
    const focused = d.flights.find(f => f.aircraft_id === search.aircraft && (f.status === "DIVERTED" || f.status === "DISPATCHED" || f.status === "EN_ROUTE"));
    if (focused) document.getElementById(`flight-${focused.id}`)?.scrollIntoView({ block: "center" });
  }, [search.aircraft]);
  const [flightNumber, setFlightNumber] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteWaypoint[] | null>(null);
  const [routeMode, setRouteMode] = useState<"route" | "direct">("route");
  const numberValid = flightNumberSchema.safeParse(flightNumber ?? d.nextFlightNumber ?? "").success;
  const [filter, setFilter] = useState("");
  const [explicitTiers, setTiers] = useState<number[] | null>(null);
  const [dealSort, setDealSort] = useState<DealSort>("best");
  const [quoteResult, setQuoteResult] = useState<{ key: string; context: string; value: Quote } | null>(null);
  const [busy, setBusy] = useState(false);
  const webSimAllowed = d.rules["web_simulation_enabled"] === true;
  const [simulation, setSimulation] = useState(webSimAllowed);
  useEffect(() => { if (!webSimAllowed) setSimulation(false); }, [webSimAllowed]);
  const [cargoKg, setCargoKg] = useState(0);
  const [cargoQuoteKg, setCargoQuoteKg] = useState(0);
  const [passengers, setPassengers] = useState<number | null>(null);
  const [quotePassengers, setQuotePassengers] = useState<number | null>(null);
  const [targetFuel, setTargetFuel] = useState<number | null>(null);
  const [targetQuoteFuel, setTargetQuoteFuel] = useState<number | null>(null);
  const [pendingRamp, setPendingRamp] = useState<SimbriefPlan["rampFuel"]>(null);
  const [flightMode, setFlightMode] = useState<FlightMode>("commercial");
  const allCargo = flightMode !== "commercial";
  const simulationEnabled = simulation && webSimAllowed;
  const [quoteError, setQuoteError] = useState("");
  const [now, setNow] = useState(d.serverTime);
  const selected =
    d.fleet.find((f) => f.id === aircraft) ?? d.fleet.find((f) => f.status === "AVAILABLE");
  const origin = d.airports.find((a) => a.icao === selected?.location_icao);
  const tiers = dispatchAirportTiers(selected?.type?.tier ?? 1, explicitTiers);
  const marketDay = new Date(now).toISOString().slice(0, 10);
  const rulesKey = JSON.stringify([d.rules, d.bases, overview.rules, marketDay]);
  const usableRangePct = 1;
  const ferry = flightMode === "ferry";
  const cargoBonus = Number(overview.rules.all_cargo_capacity_bonus ?? 0.5);
  const cargoCapacity = Math.floor((selected?.type?.cargo_kg ?? 0) * (allCargo ? 1 + cargoBonus : 1));
  const payload = { ...flightModePayload(flightMode, cargoQuoteKg, cargoCapacity), ...(quotePassengers !== null ? { passengers: quotePassengers } : {}), ...(targetQuoteFuel !== null ? { targetFuelGal: targetQuoteFuel } : {}) };
  const quoteContext = JSON.stringify([selected?.id, selected?.status, destination, flightMode, rulesKey]);
  const quoteKey = JSON.stringify([quoteContext, payload.cargoKg, quotePassengers, targetQuoteFuel]);
  const confirmedQuote = quoteResult?.context === quoteContext ? quoteResult.value : null;
  const planning = confirmedQuote ? payloadPlanning(confirmedQuote, flightMode, passengers, cargoKg, targetFuel) : null;
  const quote = planning?.quote ?? confirmedQuote;
  const payloadPending = cargoKg !== cargoQuoteKg || passengers !== quotePassengers || targetFuel !== targetQuoteFuel || quoteResult?.key !== quoteKey;
  const rangeNm = selected?.type?.range_nm ?? 0;
  const payloadRange = flightModeRange("commercial", rangeNm, usableRangePct);
  const beyondPayloadRange = !ferry && quote !== null && quote.distance_nm > payloadRange;
  const rangeError = beyondPayloadRange || commercialRangeError(quoteError);
  const ferryAvailable = !ferry && rangeError && (quote === null || quote.distance_nm <= rangeNm);
  function selectFlightMode(mode: FlightMode) {
    const capacity = Math.floor((selected?.type?.cargo_kg ?? 0) * (mode === "commercial" ? 1 : 1 + cargoBonus));
    const next = flightModePayload(mode, cargoKg, capacity);
    setFlightMode(mode);
    setCargoKg(next.cargoKg);
    setCargoQuoteKg(next.cargoKg);
    setPassengers(mode === 'commercial' ? null : 0);
    setQuotePassengers(mode === 'commercial' ? null : 0);
    setTargetFuel(null);
    setTargetQuoteFuel(null);
    setQuoteResult(null);
    setQuoteError("");
  }
  const revenueBreakdown = quote && selected?.type ? ticketRevenueBreakdown(quote.ticket_revenue ?? quote.revenue, quote.passengers, selected.type.tier, quote.rules.charter_by_tier, quote.short_hop_charter, quote.demand?.hub_bonus ?? 0) : null;
  const reserveMinutes = Number(d.rules["fuel_reserve_minutes"]);
  const fuelDensity = Number(selected?.type?.fuel_type === "100LL" ? overview.rules.avgas_kg_per_litre : overview.rules.jeta_kg_per_litre);
  const fuelPlan = quote ? plannedFuel(quote.fuel_gal, reserveMinutes, Number(selected?.type?.fuel_burn_gph ?? 0)) : null;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (cargoKg > cargoCapacity) setCargoKg(cargoCapacity);
  }, [cargoCapacity, cargoKg]);
  useEffect(() => {
    const t = setTimeout(() => setTargetQuoteFuel(targetFuel), 300);
    return () => clearTimeout(t);
  }, [targetFuel]);
  useEffect(() => { setTargetFuel(null); setTargetQuoteFuel(null); }, [selected?.id, destination]);
  useEffect(() => { setPassengers(null); setQuotePassengers(null); setCargoKg(0); setCargoQuoteKg(0); }, [selected?.id]);
  useEffect(() => {
    if (!pendingRamp || !quote?.tank) return;
    const gal = simbriefRampToGallons(pendingRamp.value, pendingRamp.unit, fuelDensity);
    setPendingRamp(null);
    if (gal === null) return;
    const v = Math.round(Math.min(quote.tank.max_target_gal, Math.max(quote.tank.min_target_gal, gal)));
    setTargetFuel(v);
    toast.info(`Target fuel synced from SimBrief ramp fuel: ${v} gal`);
  }, [pendingRamp, quote, fuelDensity]);
  useEffect(() => {
    const t = setTimeout(() => setCargoQuoteKg(cargoKg), 300);
    return () => clearTimeout(t);
  }, [cargoKg]);
  useEffect(() => {
    const t = setTimeout(() => setQuotePassengers(passengers), 300);
    return () => clearTimeout(t);
  }, [passengers]);
  useEffect(() => {
    setQuoteError("");
    if (!selected || selected.status !== "AVAILABLE" || !destination) return;
    let active = true;
    action({ data: { action: "quote", aircraft: selected.id, destination, ...payload } })
      .then((q) => {
        if (active) {
          const result = q as Quote;
          setQuoteResult({ key: quoteKey, context: quoteContext, value: result });
          if (quotePassengers !== null) setPassengers(current => current === quotePassengers ? result.passengers : current);
          setCargoKg(current => current === cargoQuoteKg ? result.cargo_kg ?? 0 : current);
        }
      })
      .catch((e) => {
        if (active) setQuoteError(displayTerminology(e.message));
      });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.status, destination, action, quoteKey]);
  const deals = useDispatchDeals(selected?.status === "AVAILABLE" ? selected.id : undefined, origin?.icao, tiers, filter, payload.cargoKg, payload.allCargo, rulesKey, quotePassengers, targetQuoteFuel);
  const destinations = useMemo(() => sortDestinationDeals(tiers.length ? deals.data ?? [] : [], dealSort), [deals.data, dealSort, tiers.length]);
  const topDeals = useMemo(() => topDestinationDeals(destinations), [destinations]);
  const activeRoute = route && route[0]?.ident === origin?.icao && route[route.length - 1]?.ident === destination ? route : null;
  async function run(kind: "dispatch" | "start" | "settle" | "cancel" | "divert", flight?: string, alternate?: string) {
    setBusy(true);
    try {
      await action({ data: { action: kind, aircraft: selected?.id, destination: alternate ?? destination, flight, flightNumber: kind === "dispatch" ? (flightNumber ?? d.nextFlightNumber ?? "") : undefined, ...(kind === "dispatch" ? { ...payload, simulation: simulationEnabled, ...(activeRoute && routeMode === "route" ? { routeWaypoints: activeRoute } : {}) } : {}) } });
      if (kind === "dispatch") {
        setFlightNumber(null);
        setCargoKg(0);
        setCargoQuoteKg(0);
        setPassengers(null);
        setQuotePassengers(null);
        setFlightMode("commercial");
        setDestination("");
        setRoute(null);
        setQuoteResult(null);
      }
      await qc.invalidateQueries();
      toast.success(
        kind === "divert" ? "Divert landing recorded — contract on hold" : kind === "settle"
          ? "Flight settled in Smooth Coins"
          : kind === "start"
            ? "Test flight airborne"
            : kind === "cancel"
              ? "Flight cancelled"
              : simulationEnabled ? "Passengers reserved — ready for departure" : "Flight dispatched — connect your ACARS client",
      );
    } catch (e) {
      if (kind === "dispatch" && e instanceof Error && commercialRangeError(e.message)) setQuoteError(displayTerminology(e.message));
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
          <p className="readout text-xs uppercase text-amber">Operations · Flight planning</p>
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
            setFlightMode("commercial");
            setCargoKg(0);
            setCargoQuoteKg(0);
          }}
        >
          <option value="">Select aircraft</option>
          {d.fleet
            .filter((f) => f.status === "AVAILABLE" || f.id === selected?.id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.registration} · {f.type?.model} · {f.location_icao}{f.status !== "AVAILABLE" ? ` · ${f.status.replaceAll("_", " ")}` : ""}
              </option>
            ))}
        </select>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-muted-foreground">
          <span>{origin?.name ?? "No available aircraft"}</span>
          <span>{ferry ? `${Math.floor(rangeNm)} NM ferry limit (100%) · empty repositioning` : `Max range ${Math.floor(rangeNm)} NM · payload & fuel bounded by MTOW`}</span>
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
                <DestinationAlternatives aircraftId={selected?.id} originIcao={origin?.icao} target={destination} tiers={tiers} cargoKg={payload.cargoKg} allCargo={payload.allCargo} rulesKey={rulesKey} passengers={quotePassengers} targetFuel={targetQuoteFuel} selectedMargin={payloadPending ? null : quote?.net ?? null} onSelect={setDestination} />
              </div>
            </section>
            <section className="border-t border-border pt-4 lg:border-t-0 lg:pt-0">
              <SimbriefImport
                origin={origin?.icao ?? ""}
                onImport={(plan) => {
                  if (plan.flightNumber && flightNumberSchema.safeParse(plan.flightNumber).success) setFlightNumber(plan.flightNumber);
                  if (plan.destination) setDestination(plan.destination);
                  setRoute(plan.route); setRouteMode("route");
                  setPendingRamp(plan.rampFuel);
                }}
              />
              {activeRoute && <div className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="readout text-xs uppercase text-muted-foreground">{routeMode === "route" ? `SimBrief route · ${activeRoute.length - 2} fixes` : "Direct great circle"}</p>
                  <Button size="sm" variant="outline" onClick={() => setRouteMode(routeMode === "route" ? "direct" : "route")}>{routeMode === "route" ? <><X className="mr-1 h-3 w-3" />Reset to direct</> : "Show SimBrief route"}</Button>
                </div>
                <ClientOnly fallback={<div className="h-[320px] border border-border" />}>
                  <Suspense fallback={<div className="h-[320px] border border-border" />}><RoutePreviewMap points={activeRoute} mode={routeMode} /></Suspense>
                </ClientOnly>
                <p className="mt-1 text-[11px] text-muted-foreground">Visual only — prices and fuel use the direct distance.</p>
              </div>}
              <label htmlFor="flight-number" className="block text-xs uppercase text-muted-foreground">Flight number</label>
              <Input id="flight-number" className="mb-5 mt-2 readout" value={flightNumber ?? d.nextFlightNumber ?? ""} maxLength={12} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} aria-invalid={!numberValid} />
              {!numberValid && <p role="alert" className="mb-4 text-sm text-destructive">Flight number must contain 3–12 letters or digits and start with a letter.</p>}
              <div className="mb-5 border-y border-border py-4">
                <FlightModeSelector value={flightMode} onChange={selectFlightMode} rangeNm={rangeNm} usableRangePct={usableRangePct} cargoAvailable={Math.floor((selected?.type?.cargo_kg ?? 0) * (1 + cargoBonus)) >= 10} />
                {ferry ? <div className="mt-4 border-l-2 border-amber bg-panel px-3 py-3 text-sm text-amber">
                  <p className="readout text-xs uppercase">Ferry repositioning · 0 PAX · 0 kg</p>
                  <p className="mt-2">No revenue · fuel, airport fees and maintenance only.</p>
                  <p className="readout mt-2 text-xs">Full range: {Math.floor(rangeNm)} NM (100%)</p>
                </div> : allCargo ? <p className="mt-3 text-xs text-muted-foreground">All-Cargo: +{Math.round(cargoBonus * 100)}% capacity · −{Math.round(Number(overview.rules.cargo_airport_fee_discount ?? 0.4) * 100)}% airport fees</p> : null}
              </div>
              <p className="readout text-xs uppercase text-amber">Pre-flight estimate</p>
              <h2 className="readout mt-2 border-y border-border bg-panel py-3 text-2xl text-primary">
                {origin?.icao ?? "—"} → {destination || "—"}
              </h2>
              {quoteError && (
                <p role="alert" className="mt-4 text-destructive">
                  {quoteError}
                </p>
              )}
              {beyondPayloadRange && !commercialRangeError(quoteError) && <p role="alert" className="mt-4 text-amber">Route exceeds the aircraft range of {payloadRange} NM.</p>}
              {ferryAvailable && <Button variant="outline" className="mt-3 h-auto w-full whitespace-normal py-2 text-amber" onClick={() => selectFlightMode("ferry")}><Plane className="h-4 w-4" />Not enough MTOW/fuel for payload · Switch to empty Ferry</Button>}
              {quote ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="text-sm text-muted-foreground">
                      {quote.passengers} passengers · {quote.cargo_kg ?? 0} kg cargo · {Math.round(quote.distance_nm)} NM ·{" "}
                      {Math.round(quote.minutes)} min
                    </p>
                    {quote.saturation && <CorridorSaturationBadge saturation={quote.saturation} />}
                  </div>
                  {quote.demand && !quote.all_cargo && quote.demand.factor < 1 && <p className="mt-1 text-xs text-amber">Passengers: {quote.passengers}/{quote.demand.raw_passengers} (-{Math.round((1 - quote.demand.factor) * 100)}% local demand to Size {quote.demand.destination_size})</p>}
                  {quote.tank && <FuelTankPanel tank={quote.tank} value={targetFuel ?? quote.tank.target_fuel_gal} onChange={setTargetFuel} kgPerLitre={fuelDensity} market={quote.fuel_market} {...(quote.weight_budget ? { reserveGal: quote.weight_budget.reserve_fuel_gal } : {})} />}
                  {quote.weight_budget && <WeightBalancePanel {...(selected?.location_icao ? { originIcao: selected.location_icao } : {})} budget={quote.weight_budget} passengers={quote.passengers} cargoKg={quote.cargo_kg ?? 0} canAutoLoad={!ferry && planning !== null} onAutoLoad={() => {
                    if (!confirmedQuote) return;
                    const mix = bestPayloadMix(confirmedQuote, flightMode, targetFuel);
                    setPassengers(mix.passengers); setCargoKg(mix.cargoKg);
                  }} {...(planning ? { controls: { mode: flightMode, maxPax: planning.maxPax, maxCargo: planning.maxCargo, ticketRevenue: quote.ticket_revenue ?? 0, cargoRevenue: quote.cargo_revenue ?? 0,
                    onPassengers: (v: number) => { setPassengers(v); setCargoKg(planning.cargoKg); },
                    onCargo: (v: number) => { setPassengers(planning.passengers); setCargoKg(v); },
                  } } : {})} />}
                  {payloadPending && <p role="status" className="mt-2 text-xs text-muted-foreground">Confirming load estimate…</p>}
                  {quote.runway_unpaved && <p className="mt-1 text-xs text-amber">[UNPAVED] No paved runway nearby — remote strip fallback</p>}
                  <dl className="readout mt-5 space-y-3">
                    {[
                      ["Ticket revenue", quote.ticket_revenue ?? quote.revenue],
                      ...((quote.cargo_kg ?? 0) > 0 ? [[`Cargo revenue (${quote.cargo_kg} kg)`, quote.cargo_revenue ?? 0]] : []),
                      [quote.tank?.persistent ? "Fuel burn (value)" : "Fuel", -quote.fuel_cost],
                      [quote.weight_budget ? `Landing (MTOW ${(quote.weight_budget.mtow_kg / 1000).toFixed(1)} t × ${formatCr(quote.weight_budget.landing_fee_per_ton_mtow)}/t × T${quote.demand?.destination_size ?? "?"} rate)` : "Landing", -quote.landing_fee],
                      ["Handling fee", -quote.handling_fee],
                      ["Maintenance reserve", -quote.maintenance],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-3 text-sm">
                        <dt className="min-w-0">{label}{label === "Ticket revenue" && !allCargo && revenueBreakdown && quote && (
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
                    <div className="flex items-center gap-1.5"><p className="readout text-xs uppercase text-primary">Fuel · Pay-as-you-burn</p>
                    <InfoHint label="Fuel billing">
                      <p>Billed from actual ACARS consumption ({Math.round((quote.weight_budget?.fuel_billing_floor_pct ?? 0.8) * 100)}% estimated trip fuel minimum floor; {reserveMinutes}-min safety reserve is never charged unless consumed). {quote.tank?.persistent ? `Owned/leased: you pay ${formatCr(quote.tank.uplift_cost)} at departure for ${Math.round(quote.tank.added_fuel_gal)} gal uplift only; remaining fuel stays in the tanks for the next flight.` : "Spot rental: choose your real fuel load above; nothing is charged at departure, you pay only for fuel burned and the aircraft is returned after landing."}</p>
                      <p>Load at least the planned fuel before departure. Compare it with your SimBrief / aircraft EFB block fuel: taxi, contingency and alternate requirements may increase the simulator's total. Use the higher requirement; SmoothSky's estimate does not validate your simulator fuel load.</p>
                      <p>Reserve follows the current administrator setting. Weekly lease costs are excluded from this estimate.</p>
                    </InfoHint></div>
                    <p className="readout mt-1 text-xs text-muted-foreground">Billing floor {Math.round((quote.weight_budget?.fuel_billing_floor_pct ?? 0.8) * 100)}% of trip fuel · reserve never charged unless burned</p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div><dt className="text-muted-foreground">Estimated trip consumption</dt><dd className="readout mt-1">{fuelLabel(fuelPlan.tripGallons, fuelDensity)}</dd></div>
                      <div><dt className="text-muted-foreground">Required reserve · {reserveMinutes} min</dt><dd className="readout mt-1">{fuelLabel(fuelPlan.reserveGallons, fuelDensity)}</dd></div>
                      <div><dt className="text-primary">Planned fuel including reserve</dt><dd className="readout mt-1 text-primary">{fuelLabel(fuelPlan.plannedGallons, fuelDensity)}</dd></div>
                    </dl>
                  </aside>}
                   {quote.fob_discounts && quote.fob_discounts.savings > 0 && <div className="mt-4 border-y border-border py-3 text-xs text-primary"><p className="readout">FBO savings included · {formatCr(quote.fob_discounts.savings)}</p><p className="mt-1">Fuel {quote.fob_discounts.fuel * 100}% · Landing {quote.fob_discounts.landing * 100}% · Handling {quote.fob_discounts.handling_origin * 100}% origin / {quote.fob_discounts.handling_destination * 100}% destination · Maintenance {quote.fob_discounts.maintenance * 100}%</p></div>}
                  <Button
                    className="mt-5 w-full"
                    disabled={
                      busy || payloadPending || rangeError || !canDispatchPayload(flightMode, quote.passengers, quote.cargo_kg ?? 0) || !numberValid

                    }
                    onClick={() => run("dispatch")}
                  >
                    <Plane className="h-4 w-4" />
                    {ferry ? "Dispatch ferry flight" : "Dispatch flight"}
                  </Button>
                </>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  {quoteError ? "Estimate unavailable" : destination ? "Calculating…" : "No destination selected"}
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
        <p className="mt-2 text-xs text-muted-foreground">Unstarted dispatches auto-recall after {String(d.rules["dispatch_timeout_hours"] ?? 3)} h without ACARS activity for {String(d.rules["dispatch_telemetry_grace_minutes"] ?? 30)} min. Departed, en-route and diverted flights are never auto-recalled.</p>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {d.flights.map((f) => {
            const acars = f.execution_source === "ACARS_AGENT";
            const progress = acars ? 0 : flightProgress(f, now);
            const live = (f.telemetry as { live?: { altitude_ft?: number; ground_speed_kt?: number; fuel_gal?: number; phase?: string } } | null)?.live;
            const active = f.status === "DISPATCHED" || f.status === "EN_ROUTE";
            const continuationTank = (f.estimate as Quote | null)?.tank;
            const continuationFuelKgPerGal = (f.estimate as Quote | null)?.weight_budget?.fuel_kg_per_gal;
            return (
              <div key={f.id} id={`flight-${f.id}`} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-4 py-4">
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
                <div className={cn("flex flex-wrap gap-2", f.status === "DIVERTED" && "w-full min-w-0")}>
                  {f.status === "DIVERTED" && <DivertControls flight={f.id} destination={f.destination_icao} state={f.divert_state} />}
                  {(active || f.status === "DIVERTED") && <FlightBriefing flightId={f.id} />}
                  {f.status === "DISPATCHED" && f.divert_state && <div className="w-full min-w-0">
                    <ContinuationFuelNotice persistent={d.fleet.find(a => a.id === f.aircraft_id)?.ownership !== "RENTAL"} ready />
                    {continuationTank && <FuelTankPanel tank={continuationTank} value={continuationTank.target_fuel_gal} onChange={() => {}} market={(f.estimate as Quote).fuel_market} {...(continuationFuelKgPerGal ? { kgPerLitre: continuationFuelKgPerGal / 3.785411784 } : {})} readOnly />}
                  </div>}
                  {f.status === "DISPATCHED" && !acars && (
                    <>
                      <Button size="sm" disabled={busy || !simulationEnabled || f.execution_source !== "WEB_MANUAL"} title={!simulationEnabled ? "Web simulation disabled — fly via ACARS" : undefined} onClick={() => run("start", f.id)}>
                        <Play className="h-4 w-4" />
                        Start test flight · {String(d.rules["simulation_time_scale"])}×
                      </Button>
                    </>
                  )}
                  {f.status === "EN_ROUTE" && !acars && (
                    <Button size="sm" variant="outline" disabled={busy || progress < 1 || !simulationEnabled} onClick={() => {
                      const alternate = prompt("Test divert — alternate airport ICAO");
                      if (alternate?.trim()) void run("divert", f.id, alternate.trim().toUpperCase());
                    }}><Navigation className="h-4 w-4" />Divert (test)</Button>
                  )}
                  {f.status === "EN_ROUTE" && !acars && (
                    <Button disabled={busy || progress < 1} onClick={() => run("settle", f.id)}>
                      <Check className="h-4 w-4" />
                      {progress < 1
                        ? `${Math.round(progress * 100)}% · En route`
                        : "Complete & settle"}
                    </Button>
                  )}
                  {active && f.divert_state && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Cancel continuation ${f.flight_number}? New fuel uplift is refunded; the contract stays on hold at ${f.origin_icao}.`)) void run("cancel", f.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                      Cancel continuation
                    </Button>
                  )}
                  {active && !f.divert_state && <RecallFlightButton flightId={f.id} flightNumber={f.flight_number} originIcao={f.origin_icao} />}
                  {f.status === "COMPLETED" && (
                    <><FlightDebrief flightNumber={f.flight_number} route={`${f.origin_icao} → ${f.destination_icao}`} settlement={f.settlement} estimate={f.estimate} telemetry={f.telemetry} estimatedMinutes={f.estimated_minutes} divertState={f.divert_state} /><span className="readout text-primary">
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
