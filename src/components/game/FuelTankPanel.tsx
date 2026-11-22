import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Quote } from "@/lib/operations";
import { formatCr } from "@/lib/rules";

type Tank = NonNullable<Quote["tank"]>;

export function FuelTankPanel({ tank, value, onChange }: { tank: Tank; value: number; onChange: (v: number) => void }) {
  const gal = (v: number) => `${Math.round(v).toLocaleString("en-US")} gal`;
  const min = Math.ceil(tank.min_target_gal);
  const max = Math.max(min, Math.floor(tank.max_target_gal));
  const current = Math.min(max, Math.max(min, Math.round(value)));
  if (!tank.persistent) {
    return (
      <section aria-label="Fuel in tanks" className="mt-4 border-y border-border bg-panel px-3 py-3 text-xs">
        <p className="readout uppercase text-primary">Fuel · Spot rental</p>
        <p className="mt-1 text-muted-foreground">Fuelled to {gal(tank.target_fuel_gal)} (trip + reserve). Billed on burned fuel only after landing.</p>
      </section>
    );
  }
  const presets: [string, number][] = [["Min safe", min], ["Tanker max", max]];
  return (
    <section aria-label="Fuel in tanks" className="mt-4 border-y border-border bg-panel px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="readout text-xs uppercase text-primary">Fuel in tanks</p>
        <p className="readout text-xs text-muted-foreground">Current {gal(tank.current_fuel_gal)}</p>
      </div>
      <div className="readout mt-2 flex items-baseline justify-between text-sm">
        <span>Target {gal(current)}</span>
        <span className={tank.added_fuel_gal > 0 ? "text-amber" : "text-primary"}>
          Uplift {gal(tank.added_fuel_gal)} · {tank.uplift_cost > 0 ? formatCr(tank.uplift_cost) : "0 SC"}
        </span>
      </div>
      <Slider aria-label="Target fuel (gal)" className="mt-3" min={min} max={max} step={1} value={[current]} onValueChange={(v) => onChange(v[0] ?? min)} disabled={max <= min} />
      <div className="mt-2 flex gap-2">
        {presets.map(([label, v]) => <Button key={label} size="sm" variant="outline" className="flex-1" onClick={() => onChange(v)}>{label}</Button>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Min {gal(min)} (trip + reserve, or fuel already on board) · Max {gal(max)} (tank / MTOW with this payload). Extra fuel reduces payload and stays in the tanks after landing.
      </p>
    </section>
  );
}
