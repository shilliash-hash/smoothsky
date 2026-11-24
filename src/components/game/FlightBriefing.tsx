import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Fuel, Package, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCr } from "@/lib/rules";
import { flightBriefing } from "@/lib/flight-briefing";
import { formatVolume, formatWeight, otherVolume, otherWeight, pricePerVolume, useUnitPreferences, type VolumeUnit, type WeightUnit } from "@/lib/unit-preferences";
import { UnitToggle } from "./UnitToggle";
import { InfoHint } from "./InfoHint";

const STATUS: Record<string, string> = { DISPATCHED: "READY", EN_ROUTE: "EN ROUTE", DIVERTED: "DIVERTED", COMPLETED: "ARRIVED", CANCELLED: "CANCELLED" };
const MODE: Record<string, string> = { commercial: "Commercial", cargo: "All-Cargo", ferry: "Ferry", mission: "Special mission" };

export const flightBriefingQuery = (flightId: string) => ({
  queryKey: ["flight-briefing", flightId] as const,
  staleTime: 5000,
  queryFn: async () => {
    const { data, error } = await supabase.from("flights")
      .select("id, flight_number, origin_icao, destination_icao, status, passengers, estimated_minutes, estimate, divert_state, created_at, aircraft:fleet_aircraft!flights_aircraft_id_fkey(registration, ownership, type:aircraft_types(manufacturer, model))")
      .eq("id", flightId).maybeSingle();
    if (error) throw error;
    return data;
  },
});

/** Read-only snapshot of the plan approved at dispatch: payload, W&B, fuel and estimated economics. */
export function FlightBriefing({ flightId, label = "Briefing", size = "sm", className }: { flightId: string; label?: string; size?: "sm" | "default"; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size={size} variant="outline" className={className} onClick={() => setOpen(true)} aria-label={`${label} for this flight`}><ClipboardCheck className="h-4 w-4" />{label}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] w-[94vw] max-w-3xl overflow-y-auto">
        {open && <BriefingBody flightId={flightId} />}
      </DialogContent>
    </Dialog>
  </>;
}

function BriefingBody({ flightId }: { flightId: string }) {
  const { data: flight, isPending, error } = useQuery(flightBriefingQuery(flightId));
  const [units, setUnits] = useUnitPreferences();
  if (isPending) return <><DialogTitle>Flight Briefing</DialogTitle><DialogDescription>Loading the approved plan…</DialogDescription></>;
  if (error || !flight) return <><DialogTitle>Flight Briefing</DialogTitle><DialogDescription role="alert">Briefing unavailable for this flight.</DialogDescription></>;

  const b = flightBriefing({ estimate: flight.estimate, divertState: flight.divert_state, passengers: flight.passengers, estimatedMinutes: flight.estimated_minutes });
  const wu = units.weight, vu = units.volume;
  const w = (kg: number) => formatWeight(kg, wu);
  const wAlt = (kg: number) => formatWeight(kg, otherWeight(wu));
  const v = (gal: number) => formatVolume(gal, vu);
  const vAlt = (gal: number) => formatVolume(gal, otherVolume(vu));
  const galKg = (gal: number) => b.fuelKgPerGal ? ` · ${w(gal * b.fuelKgPerGal)}` : "";
  const aircraft = flight.aircraft;
  const type = aircraft?.type ? `${aircraft.type.manufacturer} ${aircraft.type.model}` : null;
  const rental = aircraft?.ownership === "RENTAL" || !b.fuel.persistent;
  const status = STATUS[flight.status] ?? flight.status;
  const f = b.finance;
  const costRows: [string, number | null][] = [
    [b.fuel.persistent ? "Fuel (trip burn value)" : "Fuel (pay-as-you-burn est.)", f.fuelCost],
    ["Landing fee", f.landingFee],
    ["Handling", f.handlingFee],
    ["Maintenance reserve", f.maintenance],
  ];

  return <>
    <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
      <div className="min-w-0">
        <p className="readout text-[10px] uppercase text-amber">Approved at dispatch · {new Date(flight.created_at).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} UTC</p>
        <DialogTitle className="mt-1 flex flex-wrap items-center gap-2">Flight Briefing <span className={cn("readout rounded-sm px-2 py-0.5 text-[11px]", flight.status === "DIVERTED" ? "bg-amber/15 text-amber" : "bg-primary/15 text-primary")}>{status}</span></DialogTitle>
        <DialogDescription className="readout mt-1 break-words">{flight.flight_number ?? "Flight"} · {aircraft?.registration ?? "—"}{type ? ` · ${type}` : ""}</DialogDescription>
      </div>
      <div className="flex items-center gap-2">
        <UnitToggle<WeightUnit> label="Weight unit" options={["kg", "lbs"]} value={wu} onChange={x => setUnits({ weight: x })} />
        <UnitToggle<VolumeUnit> label="Fuel volume unit" options={["gal", "ltr"]} value={vu} onChange={x => setUnits({ volume: x })} />
      </div>
    </div>

    <div className="readout flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-border bg-panel px-3 py-2 text-sm">
      <span className="text-primary">{flight.origin_icao} → {flight.destination_icao}</span>
      {b.distanceNm !== null && <span>{Math.round(b.distanceNm)} NM</span>}
      {b.minutes !== null && <span>{Math.round(b.minutes)} min</span>}
      <span className="text-muted-foreground">{b.missionCategory ? `${b.missionCategory} mission` : MODE[b.mode]}{rental ? " · Spot rental" : ""}</span>
    </div>

    {b.divert && <p className="border-l-2 border-amber pl-3 text-xs text-amber">Continuation leg from {b.divert.airport} · original contract {b.divert.originalOrigin} → {flight.destination_icao} worth {formatCr(b.divert.contractRevenue)} is paid only on final arrival.</p>}

    {!b.hasPlan ? <p className="text-sm text-muted-foreground">No frozen plan was stored for this flight.</p> : <>
      <div className="grid gap-4 md:grid-cols-2">
        <Section icon={<Users className="h-3.5 w-3.5" />} title="Payload & Weight">
          <Row label="Passengers" value={`${b.payload.passengers} PAX`} sub={b.payload.passengerKg !== null ? `${b.payload.passengers} × ${w(b.payload.passengerKg)} = ${w(b.payload.passengers * b.payload.passengerKg)}` : undefined} />
          <Row label={<span className="flex items-center gap-1"><Package className="h-3 w-3" />Cargo</span>} value={w(b.payload.cargoKg)} sub={wAlt(b.payload.cargoKg)} />
          {b.weights ? <>
            <div className="mt-1 flex h-3 w-full overflow-hidden rounded-sm border border-border bg-background" role="img" aria-label={`Takeoff weight ${Math.round(b.weights.mtowPct)}% of MTOW`}>
              <div className="bg-muted-foreground/60" style={{ width: `${(b.weights.emptyWeightKg / b.weights.mtowKg) * 100}%` }} />
              <div className="bg-amber" style={{ width: `${(b.weights.fuelKg / b.weights.mtowKg) * 100}%` }} />
              <div className="bg-primary" style={{ width: `${(b.weights.payloadKg / b.weights.mtowKg) * 100}%` }} />
            </div>
            <Row label="OEW" value={w(b.weights.emptyWeightKg)} />
            <Row label="Fuel" value={w(b.weights.fuelKg)} />
            <Row label="Payload" value={w(b.weights.payloadKg)} />
            <Row label="Takeoff weight" value={<span className={b.weights.mtowPct >= 98 ? "text-amber" : undefined}>{w(b.weights.takeoffWeightKg)} / {w(b.weights.mtowKg)} ({Math.round(b.weights.mtowPct)}%)</span>} sub={`${wAlt(b.weights.takeoffWeightKg)} / ${wAlt(b.weights.mtowKg)}`} strong />
            <Row label="Remaining before MTOW" value={<span className="text-primary">+{w(b.weights.remainingKg)}</span>} />
          </> : <p className="text-xs text-muted-foreground">Weight & balance was not recorded for this older plan.</p>}
        </Section>

        <Section icon={<Fuel className="h-3.5 w-3.5" />} title={rental ? "Fuel · Spot rental" : "Fuel in tanks"} hint={rental
          ? <><p>Nothing was charged at departure. After landing you pay only for fuel burned (minimum-burn rule applies).</p><p>Load at least the target fuel in the simulator.</p></>
          : <><p>Only the uplift was bought at departure. Fuel left after landing stays in the tanks for the next flight.</p><p>If ACARS saw more fuel before take-off, the extra appears as a ramp adjustment.</p></>}>
          {b.fuel.initialFuelGal !== null && <Row label="On board before uplift" value={v(b.fuel.initialFuelGal)} sub={`${vAlt(b.fuel.initialFuelGal)}${galKg(b.fuel.initialFuelGal)}`} />}
          {b.fuel.targetFuelGal !== null && <Row label="Target fuel (load in sim)" value={v(b.fuel.targetFuelGal)} sub={`${vAlt(b.fuel.targetFuelGal)}${galKg(b.fuel.targetFuelGal)}`} strong />}
          {b.fuel.persistent
            ? <Row label="Uplift bought at dispatch" value={<span className="text-amber">{v(b.fuel.dispatchUpliftGal ?? 0)} · {formatCr(-(b.fuel.dispatchUpliftCost ?? 0))}</span>} />
            : <Row label="Charged at departure" value={<span className="text-primary">0 SC · billed after landing</span>} />}
          {b.fuel.rampAddedGal > 0 && <Row label="Ramp adjustment (ACARS)" value={<span className="text-amber">+{v(b.fuel.rampAddedGal)}{b.fuel.rampCost > 0 ? ` · ${formatCr(-b.fuel.rampCost)}` : ""}</span>} />}
          {b.fuel.tripFuelGal !== null && <Row label="Planned trip burn" value={v(b.fuel.tripFuelGal)} sub={vAlt(b.fuel.tripFuelGal)} />}
          {b.fuel.reserveFuelGal !== null && <Row label="Reserve (not billed unless burned)" value={v(b.fuel.reserveFuelGal)} />}
          {b.fuel.pricePerGal !== null && <Row label={`Price${b.fuel.fuelType ? ` · ${b.fuel.fuelType}` : ""}`} value={`${formatCr(pricePerVolume(b.fuel.pricePerGal, vu))} / ${vu}`} />}
          {b.fuel.billingFloorPct !== null && <p className="text-[10px] text-muted-foreground">Minimum billed burn: {Math.round(b.fuel.billingFloorPct * 100)}% of planned trip fuel.</p>}
        </Section>
      </div>

      <Section icon={<Wallet className="h-3.5 w-3.5" />} title="Estimated economics">
        {f.ticketRevenue !== null && f.ticketRevenue > 0 && <Row label={b.mode === "mission" ? "Mission payout" : "Ticket revenue"} value={<span className="text-primary">+{formatCr(f.ticketRevenue)}</span>} />}
        {f.cargoRevenue > 0 && <Row label="Cargo revenue" value={<span className="text-primary">+{formatCr(f.cargoRevenue)}</span>} />}
        {costRows.map(([label, value]) => <Row key={label} label={label} value={value === null ? "—" : formatCr(-value)} />)}
        {f.fboSavings > 0 && <Row label="FBO savings included" value={<span className="text-primary">{formatCr(f.fboSavings)}</span>} />}
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3 font-semibold">
          <span className="text-amber">Estimated contribution margin</span>
          <span className={cn("readout text-lg", (f.net ?? 0) >= 0 ? "text-primary" : "text-destructive")}>{f.net === null ? "—" : formatCr(f.net)}</span>
        </div>
        {b.fuel.persistent && b.fuel.upliftCost !== null && <p className="text-[10px] text-muted-foreground">Cash already paid at departure: {formatCr(b.fuel.upliftCost)} fuel uplift{b.fuel.rampCost > 0 ? " incl. ramp adjustment" : ""}. The margin counts the trip burn value instead.</p>}
      </Section>
    </>}
    <p className="readout text-[10px] uppercase text-muted-foreground">Frozen plan · final results appear in the Flight Debrief after landing</p>
  </>;
}

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="min-w-0 space-y-2 border-y border-border bg-panel px-3 py-3">
    <div className="flex items-center gap-1.5"><span className="text-amber">{icon}</span><p className="readout text-xs uppercase text-primary">{title}</p>{hint && <InfoHint label={title}>{hint}</InfoHint>}</div>
    {children}
  </section>;
}

function Row({ label, value, sub, strong }: { label: ReactNode; value: ReactNode; sub?: string | undefined; strong?: boolean }) {
  return <div className="readout text-xs">
    <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 text-muted-foreground">{label}</span><span className={cn("shrink-0 text-right", strong && "text-sm text-foreground")}>{value}</span></div>
    {sub && <p className="text-right text-[10px] text-muted-foreground">{sub}</p>}
  </div>;
}
