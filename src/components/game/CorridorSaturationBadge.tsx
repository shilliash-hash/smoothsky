import { InfoHint } from "@/components/game/InfoHint";
import type { CorridorSaturation } from "@/lib/operations";
import { cn } from "@/lib/utils";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const percent = (factor: number) => Math.round(factor * 100);

export function CorridorSaturationBadge({ saturation }: { saturation: CorridorSaturation }) {
  const { pax, cargo } = saturation;
  const paxPercent = percent(pax.factor);
  const cargoPercent = percent(cargo.factor);
  const floorReached = pax.floor_reached || cargo.floor_reached;

  let label = "100% Corridor";
  if (saturation.applied === false) {
    label = "Corridor monitor off";
  } else if (pax.floor_reached && cargo.floor_reached) {
    label = paxPercent === cargoPercent ? `Floor ${paxPercent}%` : `Floor ${paxPercent}% / ${cargoPercent}%`;
  } else if (floorReached) {
    label = `Floor ${pax.floor_reached ? paxPercent : cargoPercent}%`;
  } else if (paxPercent === cargoPercent && paxPercent < 100) {
    label = `${paxPercent}% Saturated`;
  } else if (paxPercent !== cargoPercent) {
    label = `PAX ${paxPercent}% · Cargo ${cargoPercent}%`;
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={cn(
        "readout inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-wide",
        floorReached ? "border-amber/50 bg-amber/10 text-amber" : "border-primary/40 bg-primary/10 text-primary",
      )}>
        {label}
      </span>
      <InfoHint label={`Corridor demand · ${saturation.window_hours}h rolling window`}>
        {saturation.applied === false && <p>Corridor demand adjustment is not applied to this quote.</p>}
        <div>
          <p className="font-medium text-foreground">Passengers</p>
          <p>{amount.format(pax.corridor_flown)} PAX flown on this corridor. Feeder credit absorbed {amount.format(pax.feeder_credit)} PAX from completed non-shuttle connecting arrivals.</p>
          <p>Effective excess: {amount.format(pax.effective_excess)} PAX · Demand: {paxPercent}%.</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Cargo</p>
          <p>{amount.format(cargo.corridor_flown_kg)} kg flown on this corridor. Feeder credit absorbed {amount.format(cargo.feeder_credit_kg)} kg from completed non-shuttle connecting arrivals.</p>
          <p>Effective excess: {amount.format(cargo.effective_excess_kg)} kg · Demand: {cargoPercent}%.</p>
        </div>
        <p>
          {floorReached
            ? `Floor active: ${pax.floor_reached ? "PAX" : ""}${pax.floor_reached && cargo.floor_reached ? " + " : ""}${cargo.floor_reached ? "Cargo" : ""}. `
            : ""}
          Minimum demand guarantee: {percent(pax.floor_pct)}% PAX / {percent(cargo.floor_pct)}% Cargo. Demand recovers as flights leave the {saturation.window_hours}h window.
        </p>
      </InfoHint>
    </span>
  );
}
