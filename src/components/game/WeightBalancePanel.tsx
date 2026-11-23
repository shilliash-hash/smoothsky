import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Package, Users, WandSparkles } from "lucide-react";
import { formatCr } from "@/lib/rules";
import type { FlightMode } from "@/lib/flight-mode";
import type { Quote } from "@/lib/operations";

type Budget = NonNullable<Quote["weight_budget"]>;

export function WeightBalancePanel({ budget, passengers, cargoKg, canAutoLoad, onAutoLoad, controls }: {
  budget: Budget; passengers: number; cargoKg: number; canAutoLoad: boolean; onAutoLoad: () => void;
  controls?: { mode: FlightMode; maxPax: number; maxCargo: number; ticketRevenue: number; cargoRevenue: number; onPassengers: (v: number) => void; onCargo: (v: number) => void };
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
      {controls && <div className="mt-4 space-y-4 border-b border-border pb-4">
        <div>
          <label htmlFor="payload-pax" className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 uppercase text-muted-foreground"><Users className="h-3.5 w-3.5" />Passengers</span><span className="readout">{passengers} / {controls.maxPax} PAX</span></label>
          <Slider id="payload-pax" aria-label="Passengers (PAX)" className="mt-3" min={0} max={controls.maxPax} step={1} value={[passengers]} onValueChange={v => controls.onPassengers(v[0] ?? 0)} disabled={controls.mode !== 'commercial' || controls.maxPax === 0} />
          <p className="readout mt-2 text-xs text-muted-foreground">{controls.mode === 'cargo' ? 'Cabin converted to freight' : controls.mode === 'ferry' ? 'Ferry repositioning' : `${passengers} × ${Math.round(budget.passenger_weight_kg)} kg · Est. tickets: ${formatCr(controls.ticketRevenue)}`}</p>
        </div>
        <div>
          <label htmlFor="payload-cargo" className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 uppercase text-muted-foreground"><Package className="h-3.5 w-3.5" />Cargo</span><span className="readout">{cargoKg} / {controls.maxCargo} kg</span></label>
          <Slider id="payload-cargo" aria-label="Cargo (kg)" className="mt-3" min={controls.mode === 'cargo' ? Math.min(10, controls.maxCargo) : 0} max={controls.maxCargo} step={1} value={[cargoKg]} onValueChange={v => controls.onCargo(v[0] ?? 0)} disabled={controls.mode === 'ferry' || controls.maxCargo === 0} />
          <p className="readout mt-2 text-xs text-muted-foreground">{controls.mode === 'ferry' ? 'Ferry repositioning' : `${controls.mode === 'cargo' ? 'All-Cargo' : 'Belly cargo'} · Est. cargo: ${formatCr(controls.cargoRevenue)}`}</p>
        </div>
      </div>}
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-sm border border-border bg-background" role="img" aria-label={`Takeoff weight ${load}% of MTOW`}>
        {parts.map(([label, v, cls]) => <div key={label} className={cls} style={{ width: pct(v) }} />)}
      </div>
      <dl className="readout mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        {parts.map(([label, v]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{kg(v)}</dd></div>)}
        <div><dt className="text-muted-foreground">Free</dt><dd className="text-primary">{kg(free)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{passengers} PAX × {Math.round(Number(budget.passenger_weight_kg))} kg + {kg(cargoKg)} cargo · fuel incl. reserve</p>
      <p className={`readout mt-2 text-xs ${load >= 98 ? 'text-amber' : 'text-primary'}`}>Remaining payload before MTOW: +{kg(free)}</p>
      {canAutoLoad && <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onAutoLoad}><WandSparkles className="h-3.5 w-3.5" />Auto-load best mix</Button>}
    </section>
  );
}
