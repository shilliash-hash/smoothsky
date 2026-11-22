import { Package, PlaneTakeoff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flightModeRange, type FlightMode } from "@/lib/flight-mode";

const modes = [
  { value: "commercial", label: "Commercial", detail: "PAX + belly cargo", icon: Users },
  { value: "cargo", label: "All-Cargo", detail: "Dedicated freight", icon: Package },
  { value: "ferry", label: "Ferry", detail: "Empty repositioning", icon: PlaneTakeoff },
] as const;

export function FlightModeSelector({ value, onChange, rangeNm, usableRangePct, cargoAvailable }: {
  value: FlightMode; onChange: (mode: FlightMode) => void;
  rangeNm: number; usableRangePct: number; cargoAvailable: boolean;
}) {
  return <fieldset>
    <legend className="mb-3 text-xs uppercase text-muted-foreground">Flight mode</legend>
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Flight mode">
      {modes.map(({ value: mode, label, detail, icon: Icon }) => <Button
        key={mode} role="radio" aria-checked={value === mode} aria-label={label}
        tabIndex={value === mode ? 0 : -1} disabled={mode === "cargo" && !cargoAvailable}
        title={mode === "cargo" && !cargoAvailable ? "This aircraft has no freight capacity" : detail}
        variant={value === mode ? "default" : "outline"}
        className="h-auto min-h-28 min-w-0 flex-col gap-1.5 rounded-sm px-1.5 py-3 text-center whitespace-normal"
        onClick={() => onChange(mode)}
        onKeyDown={(event) => {
          const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
          if (!direction && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const available = modes.filter(item => item.value !== "cargo" || cargoAvailable);
          const current = available.findIndex(item => item.value === mode);
          const next = available[event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (current + direction + available.length) % available.length];
          if (!next) return;
          onChange(next.value);
          const group = event.currentTarget.parentElement;
          const nextIndex = modes.findIndex(item => item.value === next.value);
          (group?.children.item(nextIndex) as HTMLElement | null)?.focus();
        }}
      >
        <Icon aria-hidden="true" />
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[10px] leading-4">{detail}</span>
        <span className="readout text-[10px] leading-4">{flightModeRange(mode, rangeNm, usableRangePct)} NM · {mode === "ferry" ? 100 : Math.round(usableRangePct * 100)}%</span>
      </Button>)}
    </div>
  </fieldset>;
}