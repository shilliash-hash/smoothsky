import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCr } from "@/lib/rules";
import { flightDebriefComparison, type DebriefFlight } from "@/lib/flight-debrief";

export function FlightDebrief({ flightNumber, route, ...flight }: DebriefFlight & { flightNumber: string | null; route: string }) {
  const [open, setOpen] = useState(false);
  const { settlement } = flight;
  const comparison = flightDebriefComparison(flight);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${formatCr(value)}`;
  const data = settlement && typeof settlement === "object" && !Array.isArray(settlement) ? settlement : {};
  const number = (key: string) => typeof data[key] === "number" && Number.isFinite(data[key]) ? data[key] as number : null;
  const fpm = number("landing_rate_fpm");
  const tip = number("passenger_tip") ?? 0;
  const cargo = number("cargo_revenue") ?? 0;
  const tickets = number("ticket_revenue") ?? (number("revenue") === null ? null : Math.max(0, (number("revenue") ?? 0) - cargo));
  const rows: [string, number | null][] = [
    ["Ticket revenue", tickets],
    ...(cargo > 0 ? [["Cargo revenue", cargo] as [string, number]] : []),
    ...(tip > 0 ? [[`Passenger Butter Tip (+${number("passenger_tip_pct") ?? 0}%)`, tip] as [string, number]] : []),
    ["Fuel", number("fuel_cost") === null ? null : -(number("fuel_cost") ?? 0)],
    ["Landing", comparison.finalLandingFee === null ? null : -comparison.finalLandingFee],
    ["Handling", number("handling_fee") === null ? null : -(number("handling_fee") ?? 0)],
    ["Maintenance reserve", number("maintenance") === null ? null : -(number("maintenance") ?? 0)],
  ];
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Flight debrief ${flightNumber ?? route}`}><ClipboardList className="h-4 w-4" />Debrief</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>Flight Debrief</DialogTitle>
        <DialogDescription>{flightNumber ?? "Flight"} · {route}</DialogDescription>
        {comparison.finalMinutes !== null && <div className="readout flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
          <span>Actual time {(comparison.finalMinutes / 60).toFixed(2)} h</span>
          {comparison.estimatedMinutes !== null && <span className="text-muted-foreground">Est. {(comparison.estimatedMinutes / 60).toFixed(2)} h</span>}
          {comparison.minutesDelta !== null && <span className="text-xs text-muted-foreground">({comparison.minutesDelta > 0 ? "+" : ""}{Math.round(comparison.minutesDelta)} min)</span>}
        </div>}
        {fpm !== null && <div className="border-y border-border py-4">
          <p className="text-xs uppercase text-muted-foreground">Touchdown quality</p>
          <p className={`readout mt-2 ${tip > 0 ? "text-primary" : "text-muted-foreground"}`}>{typeof data["landing_rating"] === "string" ? data["landing_rating"] : "Landing"} ({fpm} fpm)</p>
          {tip === 0 && <p className="mt-1 text-xs text-muted-foreground">No passenger tip</p>}
        </div>}
        <p className="text-xs uppercase text-amber">Financial Breakdown{flight.estimate ? " · Planned vs Final" : ""}</p>
        <dl className="readout space-y-3 text-sm">
          {rows.map(([label, value]) => <div key={label}>
            <div className="flex items-start justify-between gap-4"><dt className="min-w-0">{label}</dt><dd className={`shrink-0 ${value !== null && value > 0 ? "text-primary" : "text-muted-foreground"}`}>{label === "Fuel" && comparison.finalFuelCost !== null ? formatCr(-comparison.finalFuelCost) : value === null ? "—" : signed(value)}</dd></div>
            {label === "Fuel" && <dd className="mt-2 space-y-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {comparison.actualFuelGal !== null && <span>Actual {comparison.actualFuelGal.toFixed(1)} gal</span>}
                {comparison.actualFuelGal === null && comparison.billedFuelGal !== null && <span>Billed {comparison.billedFuelGal.toFixed(1)} gal</span>}
                {comparison.plannedFuelGal !== null && <span>Est. {comparison.plannedFuelGal.toFixed(1)} gal{comparison.plannedFuelCost !== null ? ` · ${formatCr(-comparison.plannedFuelCost)}` : ""}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {comparison.fuelSavings !== null && <span className={`border px-2 py-1 ${comparison.fuelSavings >= 0 ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}`}>
                  {comparison.fuelSavings >= 0 ? "Saved" : "Overburn"} {signed(comparison.fuelSavings)}
                </span>}
                {comparison.floorApplied && <span className="border border-amber/30 px-2 py-1 text-amber" title={comparison.actualFuelGal !== null ? `Billed ${comparison.billedFuelGal?.toFixed(1)} gal instead of actual ${comparison.actualFuelGal.toFixed(1)} gal` : "Billing floor applied to the final leg"}>
                  {comparison.floorPct !== null ? `${Math.round(comparison.floorPct * 100)}% floor applied` : "Billing floor applied"}
                </span>}
              </div>
              {comparison.floorApplied && comparison.billedFuelGal !== null && <p>Billed {comparison.billedFuelGal.toFixed(1)} gal</p>}
            </dd>}
          </div>)}
          <div className="border-t border-border pt-4">
            <div className="flex flex-wrap justify-between gap-2 font-semibold"><dt>Contribution margin</dt><dd className={(comparison.finalNet ?? 0) >= 0 ? "text-primary" : "text-destructive"}>{comparison.finalNet === null ? "—" : formatCr(comparison.finalNet)}</dd></div>
            {comparison.estimatedNet !== null && <dd className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-muted-foreground">vs Est. {formatCr(comparison.estimatedNet)}</span>
              {comparison.netDelta !== null && <span className={comparison.netDelta >= 0 ? "text-primary" : "text-destructive"}>Net delta: {signed(comparison.netDelta)}</span>}
            </dd>}
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  </>;
}