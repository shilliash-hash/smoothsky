import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";
import { formatCr } from "@/lib/rules";

export function FlightDebrief({ flightNumber, route, settlement }: { flightNumber: string | null; route: string; settlement: Json | null }) {
  const [open, setOpen] = useState(false);
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
    ["Landing", number("landing_fee") === null ? null : -(number("landing_fee") ?? 0)],
    ["Handling", number("handling_fee") === null ? null : -(number("handling_fee") ?? 0)],
    ["Maintenance reserve", number("maintenance") === null ? null : -(number("maintenance") ?? 0)],
  ];
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Flight debrief ${flightNumber ?? route}`}><ClipboardList className="h-4 w-4" />Debrief</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Flight Debrief</DialogTitle>
        <DialogDescription>{flightNumber ?? "Flight"} · {route}</DialogDescription>
        {fpm !== null && <div className="border-y border-border py-4">
          <p className="text-xs uppercase text-muted-foreground">Touchdown quality</p>
          <p className={`readout mt-2 ${tip > 0 ? "text-primary" : "text-muted-foreground"}`}>{typeof data["landing_rating"] === "string" ? data["landing_rating"] : "Landing"} ({fpm} fpm)</p>
          {tip === 0 && <p className="mt-1 text-xs text-muted-foreground">No passenger tip</p>}
        </div>}
        <p className="text-xs uppercase text-amber">Financial Breakdown</p>
        <dl className="readout space-y-3 text-sm">
          {rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4"><dt className="min-w-0">{label}</dt><dd className={`shrink-0 ${value !== null && value > 0 ? "text-primary" : "text-muted-foreground"}`}>{value === null ? "—" : `${value > 0 ? "+" : ""}${formatCr(value)}`}</dd></div>)}
          <div className="flex justify-between gap-4 border-t border-border pt-4 font-semibold"><dt>Contribution margin</dt><dd className={(number("net") ?? 0) >= 0 ? "text-primary" : "text-destructive"}>{number("net") === null ? "—" : formatCr(number("net") ?? 0)}</dd></div>
        </dl>
      </DialogContent>
    </Dialog>
  </>;
}