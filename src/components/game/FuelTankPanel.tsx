import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Quote } from "@/lib/operations";
import { formatCr } from "@/lib/rules";
import { LITRES_PER_GAL, simLoad } from "@/lib/fuel-units";
import { formatVolume, otherVolume, pricePerVolume, useUnitPreferences, type VolumeUnit } from "@/lib/unit-preferences";
import { InfoHint } from "./InfoHint";
import { UnitToggle } from "./UnitToggle";
import { MoveUpRight, MoveDownRight, MoveRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Tank = NonNullable<Quote["tank"]>;

/** Standard aviation conversion used when the catalogue density is unavailable: 1 gal = 6.7 lbs = 3.04 kg. */
const FALLBACK_KG_PER_LITRE = 3.04 / 3.785411784;

export function FuelTankPanel({ tank, value, onChange, kgPerLitre, market, reserveGal, readOnly = false }: { tank: Tank; value: number; onChange: (v: number) => void; kgPerLitre?: number; market?: Quote["fuel_market"]; reserveGal?: number; readOnly?: boolean }) {
  const [units, setUnits] = useUnitPreferences();
  const vu = units.volume;
  const vol = (g: number) => formatVolume(g, vu);
  const alt = (g: number) => formatVolume(g, otherVolume(vu));
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
  const rental = !tank.persistent;
  const min = Math.ceil(tank.min_target_gal);
  const max = Math.max(min, Math.floor(tank.max_target_gal));
  const current = Math.min(max, Math.max(min, Math.round(value)));
  const load = simLoad(current, kgPerLitre && kgPerLitre > 0 ? kgPerLitre : FALLBACK_KG_PER_LITRE);
  const comfort = reserveGal && reserveGal > 0 ? Math.min(max, Math.ceil(tank.min_target_gal + reserveGal)) : null;
  const presets: [string, number][] = [["Min safe", min], ...(comfort !== null && comfort > min && comfort < max ? [["Comfort", comfort] as [string, number]] : []), [rental ? "Max load" : "Tanker max", max]];
  const atMinimum = current <= min && max > min;
  return (
    <section aria-label="Fuel in tanks" className="mt-4 border-y border-border bg-panel px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="readout text-xs uppercase text-primary">{rental ? "Fuel · Spot rental" : "Fuel in tanks"}</p>
          <InfoHint label={rental ? "Spot rental fuel" : "Fuel in tanks"}>
            {rental ? <>
              <p>Set the fuel you will really load in the simulator — the slider is your fuel order, not a suggestion to fly on the minimum.</p>
              <p>Min = trip + reserve. Max = tank capacity or MTOW with this payload. Fuel weight reduces passengers and cargo.</p>
              <p>Nothing is charged at departure: after landing you pay only for fuel burned (minimum-burn rule applies); unburned fuel stays with the rental.</p>
              <p>If ACARS sees more fuel in the simulator before take-off, the plan rises automatically within MTOW at no extra charge.</p>
            </> : <>
              <p>Min = trip + reserve, or the fuel already on board. Max = tank capacity or MTOW with this payload.</p>
              <p>You buy only the uplift at this airport. Extra fuel reduces payload and stays in the tanks after landing.</p>
              <p>If ACARS sees more fuel in the simulator before take-off, the extra is billed as a ramp fuel adjustment.</p>
            </>}
            {market && <p>{market.pricing_model === 'smooth_cycle' ? 'Fuel prices follow a continuous, airport-specific 5–7 day cycle. Trends compare current prices with 24h and 48h forecasts; availability and future FBO discounts are not guaranteed.' : `Fuel market ${market.utc_date} changes at 00:00 UTC.`} Price deviations are shown before FBO discounts. Accepted flights retain their quoted price.</p>}
          </InfoHint>
        </div>
        <div className="flex items-center gap-2">
          <p className="readout text-xs text-muted-foreground">{rental ? "Pay-as-you-burn" : `Current ${vol(tank.current_fuel_gal)}`}</p>
          <UnitToggle<VolumeUnit> label="Fuel volume unit" options={["gal", "ltr"]} value={vu} onChange={(v) => setUnits({ volume: v })} />
        </div>
      </div>
      <div className="readout mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>Target {vol(current)} <span className="text-xs text-muted-foreground">· {alt(current)}</span></span>
        {rental
          ? <span className="text-primary">0 SC now · billed after landing</span>
          : <span className={tank.added_fuel_gal > 0 ? "text-amber" : "text-primary"}>Uplift {vol(tank.added_fuel_gal)} · {tank.uplift_cost > 0 ? formatCr(tank.uplift_cost) : "0 SC"}</span>}
      </div>
      {!readOnly && <><Slider aria-label={`Target fuel (${vu})`} className="mt-3" min={min} max={max} step={1} value={[current]} onValueChange={(v) => onChange(v[0] ?? min)} disabled={max <= min} />
      <div className="readout mt-1 flex justify-between text-[10px] text-muted-foreground"><span>Min {vol(min)}</span><span>Max {vol(max)}</span></div>
      <div className="mt-2 flex gap-2">
        {presets.map(([label, v]) => <Button key={label} size="sm" variant={v === current ? "secondary" : "outline"} className="flex-1" onClick={() => onChange(v)}>{label}</Button>)}
      </div></>}
      <p className="readout mt-3 border border-amber/40 bg-background/40 px-2 py-1.5 text-xs text-amber">Sim load: {n(load.gal)} gal · {n(load.gal * LITRES_PER_GAL)} ltr · {n(load.lbs)} lbs · {n(load.kg)} kg</p>
      {atMinimum && !readOnly && <p role="status" className="mt-2 border-l-2 border-amber bg-amber/10 px-2 py-2 text-xs text-amber">Minimum legal fuel only (trip + reserve). Any headwind, holding or go-around can force a divert right after departure — add margin or import your SimBrief plan.</p>}
      <FuelMarket market={market} persistent={!rental} unit={vu} />
    </section>
  );
}

function FuelMarket({ market, persistent, unit }: { market: Quote["fuel_market"]; persistent: boolean; unit: VolumeUnit }) {
  if (!market) return null;
  const deviation = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  const price = (v: number) => `${pricePerVolume(v, unit).toFixed(2)} SC/${unit}`;
  return <div className="mt-3 text-xs">
    <div className="grid gap-2 sm:grid-cols-2">
      <p className="readout">Departure · {market.departure_icao}<br /><span className="text-primary">{price(market.departure_price)}</span> <FuelTrend trend={market.departure_trend} /> <span className="text-muted-foreground">({deviation(market.departure_deviation_pct)})</span>{market.departure_fbo_discount > 0 && <span className="block text-muted-foreground">FBO −{Math.round(market.departure_fbo_discount * 100)}% included</span>}</p>
      <p className="readout">Destination · {market.destination_icao}<br />{market.destination_fuel_available ? <><span className="text-primary">{price(market.destination_price)}</span> <FuelTrend trend={market.destination_trend} /> <span className="text-muted-foreground">({deviation(market.destination_deviation_pct)})</span></> : <span className="text-amber">No {market.fuel_type === "Jet-A" ? "Jet-A1" : market.fuel_type} available</span>}{market.destination_fbo_discount > 0 && <span className="block text-muted-foreground">FBO −{Math.round(market.destination_fbo_discount * 100)}% included</span>}</p>
    </div>
    {persistent && (!market.destination_fuel_available || market.tankering_savings_per_gal > 0) && <p className="mt-2 border-l-2 border-primary bg-primary/10 px-2 py-2 text-primary">{market.destination_fuel_available ? `Tankering opportunity: save ~${price(market.tankering_savings_per_gal)} vs destination` : "Tankering opportunity: carry extra fuel — none available at destination"}</p>}
  </div>;
}

function FuelTrend({ trend }: { trend: NonNullable<Quote['fuel_market']>['departure_trend'] }) {
  if (!trend) return null;
  const Icon = trend.fuel_trend === 'up' ? MoveUpRight : trend.fuel_trend === 'down' ? MoveDownRight : MoveRight;
  const label = trend.fuel_trend === 'up' ? 'Fuel getting more expensive' : trend.fuel_trend === 'down' ? 'Fuel getting cheaper' : 'Fuel price stable';
  const delta = (v: number) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
  return <Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={label} className={`inline-flex align-middle ${trend.fuel_trend === 'up' ? 'text-amber' : trend.fuel_trend === 'down' ? 'text-primary' : 'text-muted-foreground'}`}><Icon className="h-3.5 w-3.5" /></span></TooltipTrigger><TooltipContent><p>{label} · 24h {delta(trend.delta_pct_24h)} · 48h {delta(trend.delta_pct_48h)}</p><p>Price forecast only; plan safe reserves before tankering.</p></TooltipContent></Tooltip>;
}
