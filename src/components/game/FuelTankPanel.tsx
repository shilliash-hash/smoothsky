import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Quote } from "@/lib/operations";
import { formatCr } from "@/lib/rules";
import { simLoad } from "@/lib/fuel-units";

type Tank = NonNullable<Quote["tank"]>;

/** Standard aviation conversion: 1 gal = 6.7 lbs = 3.04 kg. */
const SPOT_KG_PER_LITRE = 3.04 / 3.785411784;
function spotLoad(gallons: number) {
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
  const load = simLoad(gallons, SPOT_KG_PER_LITRE);
  return `${n(load.gal)} gal · ${n(load.lbs)} lbs · ${n(load.kg)} kg`;
}

export function FuelTankPanel({ tank, value, onChange, kgPerLitre, market, readOnly = false }: { tank: Tank; value: number; onChange: (v: number) => void; kgPerLitre?: number; market?: Quote["fuel_market"]; readOnly?: boolean }) {
  const gal = (v: number) => `${Math.round(v).toLocaleString("en-US")} gal`;
  const min = Math.ceil(tank.min_target_gal);
  const max = Math.max(min, Math.floor(tank.max_target_gal));
  const current = Math.min(max, Math.max(min, Math.round(value)));
  if (!tank.persistent) {
    return (
      <section aria-label="Fuel in tanks" className="mt-4 border-y border-border bg-panel px-3 py-3 text-xs">
        <p className="readout uppercase text-primary">Fuel · Spot rental</p>
        <p className="mt-1 text-muted-foreground">Fuelled to {spotLoad(tank.target_fuel_gal)} (trip + reserve). Billed on burned fuel only after landing.</p>
        <FuelMarket market={market} persistent={false} />
      </section>
    );
  }
  const load = kgPerLitre && kgPerLitre > 0 ? simLoad(current, kgPerLitre) : null;
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
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
      {!readOnly && <><Slider aria-label="Target fuel (gal)" className="mt-3" min={min} max={max} step={1} value={[current]} onValueChange={(v) => onChange(v[0] ?? min)} disabled={max <= min} />
      <div className="mt-2 flex gap-2">
        {presets.map(([label, v]) => <Button key={label} size="sm" variant="outline" className="flex-1" onClick={() => onChange(v)}>{label}</Button>)}
      </div></>}
      {load && <p className="readout mt-3 border border-amber/40 bg-background/40 px-2 py-1.5 text-xs text-amber">Sim load: {n(load.gal)} gal · {n(load.lbs)} lbs · {n(load.kg)} kg</p>}
      <FuelMarket market={market} persistent />
      <p className="mt-2 text-xs text-muted-foreground">
        Min {gal(min)} (trip + reserve, or fuel already on board) · Max {gal(max)} (tank / MTOW with this payload). Extra fuel reduces payload and stays in the tanks after landing. If ACARS sees more fuel in the simulator before take-off, the extra is billed as a ramp fuel adjustment.
      </p>
    </section>
  );
}

function FuelMarket({ market, persistent }: { market: Quote["fuel_market"]; persistent: boolean }) {
  if (!market) return null;
  const deviation = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  return <div className="mt-3 text-xs">
    <div className="grid gap-2 sm:grid-cols-2">
      <p className="readout">Departure · {market.departure_icao}<br /><span className="text-primary">{market.departure_price.toFixed(2)} SC/gal</span> <span className="text-muted-foreground">({deviation(market.departure_deviation_pct)})</span>{market.departure_fbo_discount > 0 && <span className="block text-muted-foreground">FBO −{Math.round(market.departure_fbo_discount * 100)}% included</span>}</p>
      <p className="readout">Destination · {market.destination_icao}<br />{market.destination_fuel_available ? <><span className="text-primary">{market.destination_price.toFixed(2)} SC/gal</span> <span className="text-muted-foreground">({deviation(market.destination_deviation_pct)})</span></> : <span className="text-amber">No {market.fuel_type === "Jet-A" ? "Jet-A1" : market.fuel_type} available</span>}{market.destination_fbo_discount > 0 && <span className="block text-muted-foreground">FBO −{Math.round(market.destination_fbo_discount * 100)}% included</span>}</p>
    </div>
    <p className="mt-1 text-[10px] text-muted-foreground">Market {market.utc_date} · changes at 00:00 UTC · deviations before FBO discount</p>
    {persistent && (!market.destination_fuel_available || market.tankering_savings_per_gal > 0) && <p className="mt-2 border-l-2 border-primary bg-primary/10 px-2 py-2 text-primary">{market.destination_fuel_available ? `Tankering opportunity: save ~${market.tankering_savings_per_gal.toFixed(2)} SC/gal vs destination` : "Tankering opportunity: carry extra fuel — none available at destination"}</p>}
  </div>;
}
