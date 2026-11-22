import { Button } from "@/components/ui/button";
import type { Quote } from "@/lib/operations";

type Budget = NonNullable<Quote["weight_budget"]>;

export function WeightBalancePanel({ budget, passengers, cargoKg, canAutoLoad, onAutoLoad }: {
  budget: Budget; passengers: number; cargoKg: number; canAutoLoad: boolean; onAutoLoad: () => void;
}) {
  const oew = Number(budget.empty_weight_kg);
  const mtow = Number(budget.mtow_kg);
  const fuel = Number(budget.planned_fuel_kg);
  const payload = Number(budget.payload_kg ?? passengers * Number(budget.passenger_weight_kg) + cargoKg);
  const tow = Number(budget.takeoff_weight_kg ?? oew + fuel + payload);
  const free = Math.max(0, mtow - tow);
  const pct = (v: number) => `${Math.max(0, (v / mtow) * 100)}%`;
  const load = Math.round((tow / mtow) * 100);
  const kg = (v: number) => `${Math.round(v).toLocaleString("en-US")} kg`;
  const parts = [
    ["OEW", oew, "bg-muted-foreground/60"],
    ["Fuel", fuel, "bg-amber"],
    ["Payload", payload, "bg-primary"],
  ] as const;
  return (
    <section aria-label="Weight and balance" className="mt-4 border-y border-border bg-panel px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="readout text-xs uppercase text-primary">Weight &amp; Balance</p>
        <p className={`readout text-xs ${load >= 98 ? "text-amber" : "text-muted-foreground"}`}>{kg(tow)} / {kg(mtow)} MTOW ({load}%)</p>
      </div>
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-sm border border-border bg-background" role="img" aria-label={`Takeoff weight ${load}% of MTOW`}>
        {parts.map(([label, v, cls]) => <div key={label} className={cls} style={{ width: pct(v) }} />)}
      </div>
      <dl className="readout mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        {parts.map(([label, v]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{kg(v)}</dd></div>)}
        <div><dt className="text-muted-foreground">Free</dt><dd className="text-primary">{kg(free)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{passengers} PAX × {Math.round(Number(budget.passenger_weight_kg))} kg + {kg(cargoKg)} cargo · fuel incl. reserve</p>
      {load >= 98 && <p className="mt-1 text-xs text-amber">At MTOW limit — payload was reduced to fit trip fuel and reserve.</p>}
      {canAutoLoad && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onAutoLoad}>Auto-load best mix</Button>}
    </section>
  );
}
