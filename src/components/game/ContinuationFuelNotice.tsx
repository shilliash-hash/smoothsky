import { Fuel } from "lucide-react";

export function ContinuationFuelNotice({ persistent, ready }: { persistent: boolean; ready: boolean }) {
  return <div className="mt-3 flex gap-2 border-l-2 border-primary bg-primary/10 px-3 py-3 text-xs">
    <Fuel className="h-4 w-4 shrink-0 text-primary" />
    <div><p className="font-semibold text-primary">{ready ? "Continuation ready · Refuel before taxi" : "Refuel for the continuation"}</p>
      <p className="mt-1 text-muted-foreground">{persistent
        ? ready ? "Load the planned target fuel in your simulator before taxi. ACARS synchronizes extra ramp fuel within tank, MTOW and airport-stock limits; additional uplift is charged at this airport."
          : "Choose Target Fuel below to buy only the missing fuel at this airport. Then continue the leg and load that fuel in your simulator before taxi."
        : ready ? "Refuel in your simulator before taxi, within tank capacity and MTOW. Carry at least the planned trip + reserve fuel. Spot rental fuel is billed on each landed leg, with the frozen minimum-burn rule."
          : "Select Continue leg, then refuel in your simulator before taxi. Carry at least the planned trip + reserve fuel within tank capacity and MTOW. Spot rental fuel is billed on each landed leg, with the frozen minimum-burn rule."}</p>
      <p className="mt-1 text-amber">Do not refuel after taxi has started. Passengers and cargo remain aboard; delivery deadlines keep running.</p>
    </div>
  </div>;
}